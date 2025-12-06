import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';

interface Block {
  type: 'grass' | 'dirt' | 'stone' | 'wood' | 'leaves' | 'coal_ore' | 'iron_ore' | 'air';
  x: number;
  y: number;
  z: number;
}

interface Item {
  type: string;
  count: number;
}

const CHUNK_SIZE = 24;
const RENDER_DISTANCE = 40;

const Index = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scene] = useState(() => new THREE.Scene());
  const [camera] = useState(() => new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, RENDER_DISTANCE));
  const [renderer] = useState(() => {
    const r = new THREE.WebGLRenderer({ 
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    return r;
  });
  
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [inventory, setInventory] = useState<Item[]>([
    { type: 'pickaxe', count: 1 },
    { type: 'axe', count: 1 },
  ]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [health, setHealth] = useState(20);
  const [hunger, setHunger] = useState(20);
  const [time, setTime] = useState(0);
  const [showCrafting, setShowCrafting] = useState(false);
  const [isMobile] = useState(() => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  
  const keysPressed = useRef<Set<string>>(new Set());
  const mouseMovement = useRef({ x: 0, y: 0 });
  const velocity = useRef(new THREE.Vector3());
  const raycaster = useRef(new THREE.Raycaster());
  const blockMeshes = useRef(new Map<string, THREE.Mesh>());
  const touchStart = useRef({ x: 0, y: 0 });
  const joystickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const sharedGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  
  const createPixelTexture = (colors: string[]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const index = Math.floor(Math.random() * colors.length);
        ctx.fillStyle = colors[index];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
  };

  const materials = useMemo(() => ({
    grass: new THREE.MeshLambertMaterial({ 
      map: createPixelTexture(['#7CBF3A', '#6DAF2A', '#8CCF4A']), 
      flatShading: true 
    }),
    dirt: new THREE.MeshLambertMaterial({ 
      map: createPixelTexture(['#8B4513', '#7B3503', '#9B5523']), 
      flatShading: true 
    }),
    stone: new THREE.MeshLambertMaterial({ 
      map: createPixelTexture(['#808080', '#707070', '#909090']), 
      flatShading: true 
    }),
    wood: new THREE.MeshLambertMaterial({ 
      map: createPixelTexture(['#8B4513', '#6B3010', '#AB5520']), 
      flatShading: true 
    }),
    leaves: new THREE.MeshLambertMaterial({ 
      map: createPixelTexture(['#228B22', '#1A7B1A', '#2A9B2A']), 
      flatShading: true, 
      transparent: true, 
      opacity: 0.8 
    }),
    coal_ore: new THREE.MeshLambertMaterial({ 
      map: createPixelTexture(['#343434', '#505050', '#202020']), 
      flatShading: true 
    }),
    iron_ore: new THREE.MeshLambertMaterial({ 
      map: createPixelTexture(['#D8AF93', '#C89F83', '#E8BFA3']), 
      flatShading: true 
    }),
  }), []);

  const generateTerrain = () => {
    const newBlocks: Block[] = [];
    
    for (let x = -CHUNK_SIZE / 2; x < CHUNK_SIZE / 2; x++) {
      for (let z = -CHUNK_SIZE / 2; z < CHUNK_SIZE / 2; z++) {
        const height = Math.floor(Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3 + 8);
        
        for (let y = 0; y < height; y++) {
          if (y === height - 1) {
            newBlocks.push({ type: 'grass', x, y, z });
          } else if (y > height - 4) {
            newBlocks.push({ type: 'dirt', x, y, z });
          } else {
            if (Math.random() > 0.97) {
              newBlocks.push({ type: y > 5 ? 'coal_ore' : 'iron_ore', x, y, z });
            } else {
              newBlocks.push({ type: 'stone', x, y, z });
            }
          }
        }
        
        if (Math.random() > 0.97 && height > 5) {
          const treeHeight = 4;
          for (let y = 0; y < treeHeight; y++) {
            newBlocks.push({ type: 'wood', x, y: height + y, z });
          }
          for (let lx = -1; lx <= 1; lx++) {
            for (let lz = -1; lz <= 1; lz++) {
              for (let ly = 0; ly < 2; ly++) {
                newBlocks.push({ type: 'leaves', x: x + lx, y: height + treeHeight + ly, z: z + lz });
              }
            }
          }
        }
      }
    }
    
    return newBlocks;
  };

  const createBlock = (block: Block) => {
    const mesh = new THREE.Mesh(sharedGeometry, materials[block.type]);
    mesh.position.set(block.x, block.y, block.z);
    mesh.userData = { block };
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    
    scene.add(mesh);
    blockMeshes.current.set(`${block.x},${block.y},${block.z}`, mesh);
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    renderer.setSize(window.innerWidth, window.innerHeight);
    canvasRef.current.appendChild(renderer.domElement);

    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 0, RENDER_DISTANCE);

    camera.position.set(0, 15, 15);
    camera.rotation.order = 'YXZ';

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(50, 50, 50);
    scene.add(directionalLight);

    const terrain = generateTerrain();
    setBlocks(terrain);
    terrain.forEach(block => createBlock(block));

    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase());
      if (e.key === 'e' || e.key === 'E') {
        setShowCrafting(prev => !prev);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === renderer.domElement) {
        mouseMovement.current.x -= e.movementX * 0.002;
        mouseMovement.current.y -= e.movementY * 0.002;
        mouseMovement.current.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouseMovement.current.y));
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && e.touches[0].clientX > window.innerWidth / 2) {
        const deltaX = e.touches[0].clientX - touchStart.current.x;
        const deltaY = e.touches[0].clientY - touchStart.current.y;
        
        mouseMovement.current.x -= deltaX * 0.005;
        mouseMovement.current.y -= deltaY * 0.005;
        mouseMovement.current.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouseMovement.current.y));
        
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (!isMobile && document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      } else {
        raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycaster.current.intersectObjects(scene.children.filter(obj => obj instanceof THREE.Mesh && obj.userData.block));
        
        if (intersects.length > 0) {
          const intersected = intersects[0].object as THREE.Mesh;
          const block = intersected.userData.block as Block;
          
          scene.remove(intersected);
          blockMeshes.current.delete(`${block.x},${block.y},${block.z}`);
          setBlocks(prev => prev.filter(b => !(b.x === block.x && b.y === block.y && b.z === block.z)));
          
          setInventory(prev => {
            const existing = prev.find(item => item.type === block.type);
            if (existing) {
              return prev.map(item => 
                item.type === block.type ? { ...item, count: item.count + 1 } : item
              );
            } else {
              return [...prev, { type: block.type, count: 1 }];
            }
          });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('click', handleClick);
    
    if (isMobile) {
      renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false });
      renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    }

    let lastTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);
      
      const now = performance.now();
      const delta = (now - lastTime) / 16.67;
      lastTime = now;

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const moveSpeed = 0.1 * delta;
      
      if (keysPressed.current.has('w') || joystickRef.current.y > 0.3) {
        velocity.current.add(forward.clone().multiplyScalar(moveSpeed * Math.abs(joystickRef.current.y || 1)));
      }
      if (keysPressed.current.has('s') || joystickRef.current.y < -0.3) {
        velocity.current.add(forward.clone().multiplyScalar(-moveSpeed * Math.abs(joystickRef.current.y || 1)));
      }
      if (keysPressed.current.has('a') || joystickRef.current.x < -0.3) {
        velocity.current.add(right.clone().multiplyScalar(-moveSpeed * Math.abs(joystickRef.current.x || 1)));
      }
      if (keysPressed.current.has('d') || joystickRef.current.x > 0.3) {
        velocity.current.add(right.clone().multiplyScalar(moveSpeed * Math.abs(joystickRef.current.x || 1)));
      }
      if (keysPressed.current.has(' ')) {
        velocity.current.y += 0.3 * delta;
      }

      velocity.current.y -= 0.02 * delta;
      velocity.current.multiplyScalar(0.9);

      camera.position.add(velocity.current);
      
      if (camera.position.y < 5) {
        camera.position.y = 5;
        velocity.current.y = 0;
      }

      camera.rotation.y = mouseMovement.current.x;
      camera.rotation.x = mouseMovement.current.y;

      setTime(prev => (prev + 0.0005 * delta) % (Math.PI * 2));

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
      
      if (isMobile) {
        renderer.domElement.removeEventListener('touchstart', handleTouchStart);
        renderer.domElement.removeEventListener('touchmove', handleTouchMove);
      }
      
      if (canvasRef.current && canvasRef.current.contains(renderer.domElement)) {
        canvasRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  const isDaytime = Math.cos(time) > 0;

  const handleJoystickMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = touch.clientX - centerX;
    const deltaY = touch.clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDistance = rect.width / 2;
    
    if (distance > maxDistance) {
      joystickRef.current = {
        x: (deltaX / distance) * (maxDistance / maxDistance),
        y: -(deltaY / distance) * (maxDistance / maxDistance)
      };
    } else {
      joystickRef.current = {
        x: deltaX / maxDistance,
        y: -deltaY / maxDistance
      };
    }
  };

  const handleJoystickEnd = () => {
    joystickRef.current = { x: 0, y: 0 };
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={canvasRef} className="w-full h-full" />
      
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 items-center bg-black/50 px-4 py-2 rounded-lg">
        <Icon name="Heart" className="text-red-500" size={20} />
        <div className="flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-3 h-3 border border-white"
              style={{ background: i < health / 2 ? '#ff0000' : 'transparent' }}
            />
          ))}
        </div>
        
        <Icon name="Drumstick" className="text-orange-400 ml-4" size={20} />
        <div className="flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-3 h-3 border border-white"
              style={{ background: i < hunger / 2 ? '#ffa500' : 'transparent' }}
            />
          ))}
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-lg text-white flex items-center gap-2 text-sm">
        <Icon name={isDaytime ? "Sun" : "Moon"} size={16} />
        <span>{isDaytime ? 'День' : 'Ночь'}</span>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {inventory.slice(0, 9).map((item, i) => (
          <div
            key={i}
            onClick={() => setSelectedSlot(i)}
            className={`w-12 h-12 sm:w-14 sm:h-14 border-2 ${
              selectedSlot === i ? 'border-white' : 'border-gray-600'
            } bg-black/70 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors`}
          >
            <span className="text-xl">
              {item.type === 'pickaxe' ? '⛏️' : 
               item.type === 'axe' ? '🪓' :
               item.type === 'grass' ? '🟩' :
               item.type === 'dirt' ? '🟫' :
               item.type === 'stone' ? '⬜' :
               item.type === 'wood' ? '🪵' :
               item.type === 'leaves' ? '🌿' :
               item.type === 'coal_ore' ? '⚫' :
               item.type === 'iron_ore' ? '⚪' : '❓'}
            </span>
            {item.count > 1 && (
              <span className="text-white text-xs">{item.count}</span>
            )}
          </div>
        ))}
      </div>

      {isMobile && (
        <>
          <div
            className="absolute bottom-24 left-4 w-32 h-32 bg-black/30 rounded-full border-4 border-white/20 flex items-center justify-center"
            onTouchStart={handleJoystickMove}
            onTouchMove={handleJoystickMove}
            onTouchEnd={handleJoystickEnd}
          >
            <div 
              className="w-12 h-12 bg-white/60 rounded-full transition-transform"
              style={{
                transform: `translate(${joystickRef.current.x * 30}px, ${-joystickRef.current.y * 30}px)`
              }}
            />
          </div>
          
          <button
            className="absolute bottom-32 right-4 w-16 h-16 bg-black/50 rounded-full border-4 border-white/40 flex items-center justify-center text-white text-2xl active:bg-black/70"
            onTouchStart={() => keysPressed.current.add(' ')}
            onTouchEnd={() => keysPressed.current.delete(' ')}
          >
            ⬆️
          </button>

          <button
            className="absolute bottom-48 right-4 w-12 h-12 bg-black/50 rounded-lg border-2 border-white/40 flex items-center justify-center text-white text-sm active:bg-black/70"
            onClick={() => setShowCrafting(prev => !prev)}
          >
            E
          </button>
        </>
      )}

      {showCrafting && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#C6C6C6] p-4 sm:p-6 rounded-lg border-4 border-[#555555] w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl sm:text-2xl font-bold">Верстак</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCrafting(false)}
              >
                <Icon name="X" size={20} />
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="w-12 h-12 sm:w-14 sm:h-14 border-2 border-[#555555] bg-[#8B8B8B]"
                />
              ))}
            </div>

            <div className="flex items-center justify-center gap-4">
              <Icon name="ArrowRight" size={24} />
              <div className="w-12 h-12 sm:w-14 sm:h-14 border-2 border-[#555555] bg-[#8B8B8B]" />
            </div>

            <div className="mt-4 text-xs sm:text-sm text-gray-700">
              <p>Рецепты:</p>
              <p>🪵🪵🪵 = 📦</p>
              <p>📦📦📦 + 🪑🪑 = ⛏️</p>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-6 h-6 relative">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white"></div>
          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-white"></div>
        </div>
      </div>

      {!isMobile && (
        <div className="absolute bottom-20 left-4 bg-black/70 p-3 rounded-lg text-white text-xs sm:text-sm">
          <p className="font-bold mb-1">⌨️ Управление:</p>
          <p>WASD - движение</p>
          <p>Пробел - прыжок</p>
          <p>Мышь - обзор</p>
          <p>ЛКМ - разрушить</p>
          <p>E - верстак</p>
        </div>
      )}
    </div>
  );
};

export default Index;