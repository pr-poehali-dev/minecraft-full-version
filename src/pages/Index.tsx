import { useEffect, useRef, useState } from 'react';
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

const CHUNK_SIZE = 32;
const CHUNK_HEIGHT = 16;

const Index = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scene] = useState(() => new THREE.Scene());
  const [camera] = useState(() => new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000));
  const [renderer] = useState(() => new THREE.WebGLRenderer({ antialias: true }));
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
  const keysPressed = useRef<Set<string>>(new Set());
  const mouseMovement = useRef({ x: 0, y: 0 });
  const velocity = useRef(new THREE.Vector3());
  const raycaster = useRef(new THREE.Raycaster());
  const blockMeshes = useRef(new Map<string, THREE.Mesh>());

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
            if (Math.random() > 0.95) {
              newBlocks.push({ type: y > 5 ? 'coal_ore' : 'iron_ore', x, y, z });
            } else {
              newBlocks.push({ type: 'stone', x, y, z });
            }
          }
        }
        
        if (Math.random() > 0.95 && height > 5) {
          const treeHeight = 5;
          for (let y = 0; y < treeHeight; y++) {
            newBlocks.push({ type: 'wood', x, y: height + y, z });
          }
          for (let lx = -2; lx <= 2; lx++) {
            for (let lz = -2; lz <= 2; lz++) {
              for (let ly = 0; ly < 3; ly++) {
                if (Math.abs(lx) + Math.abs(lz) < 4) {
                  newBlocks.push({ type: 'leaves', x: x + lx, y: height + treeHeight + ly - 1, z: z + lz });
                }
              }
            }
          }
        }
      }
    }
    
    return newBlocks;
  };

  const getBlockColor = (type: string): number => {
    const colors: Record<string, number> = {
      grass: 0x7CBF3A,
      dirt: 0x8B4513,
      stone: 0x808080,
      wood: 0x8B4513,
      leaves: 0x228B22,
      coal_ore: 0x343434,
      iron_ore: 0xD8AF93,
    };
    return colors[type] || 0xFFFFFF;
  };

  const createBlock = (block: Block) => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ 
      color: getBlockColor(block.type),
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(block.x, block.y, block.z);
    mesh.userData = { block };
    
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.2, transparent: true }));
    mesh.add(line);
    
    scene.add(mesh);
    blockMeshes.current.set(`${block.x},${block.y},${block.z}`, mesh);
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    canvasRef.current.appendChild(renderer.domElement);

    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 0, 100);

    camera.position.set(0, 15, 15);
    camera.rotation.order = 'YXZ';

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const terrain = generateTerrain();
    setBlocks(terrain);
    terrain.forEach(block => createBlock(block));

    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase());
      if (e.key === 'e') {
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

    const handleClick = () => {
      if (document.pointerLockElement !== renderer.domElement) {
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

    const animate = () => {
      requestAnimationFrame(animate);

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const moveSpeed = 0.2;
      
      if (keysPressed.current.has('w')) velocity.current.add(forward.multiplyScalar(moveSpeed));
      if (keysPressed.current.has('s')) velocity.current.add(forward.multiplyScalar(-moveSpeed));
      if (keysPressed.current.has('a')) velocity.current.add(right.multiplyScalar(-moveSpeed));
      if (keysPressed.current.has('d')) velocity.current.add(right.multiplyScalar(moveSpeed));
      if (keysPressed.current.has(' ')) velocity.current.y += 0.3;

      velocity.current.y -= 0.02;
      velocity.current.multiplyScalar(0.9);

      camera.position.add(velocity.current);
      
      if (camera.position.y < 10) {
        camera.position.y = 10;
        velocity.current.y = 0;
      }

      camera.rotation.y = mouseMovement.current.x;
      camera.rotation.x = mouseMovement.current.y;

      setTime(prev => (prev + 0.001) % (Math.PI * 2));

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
      if (canvasRef.current) {
        canvasRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  const isDaytime = Math.cos(time) > 0;

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={canvasRef} className="w-full h-full" />
      
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 items-center bg-black/50 px-4 py-2 rounded-lg">
        <Icon name="Heart" className="text-red-500" size={20} />
        <div className="flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-4 h-4 border-2 border-white"
              style={{ background: i < health / 2 ? '#ff0000' : 'transparent' }}
            />
          ))}
        </div>
        
        <Icon name="Drumstick" className="text-orange-400 ml-4" size={20} />
        <div className="flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-4 h-4 border-2 border-white"
              style={{ background: i < hunger / 2 ? '#ffa500' : 'transparent' }}
            />
          ))}
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-black/50 px-4 py-2 rounded-lg text-white flex items-center gap-2">
        <Icon name={isDaytime ? "Sun" : "Moon"} size={20} />
        <span>{isDaytime ? 'День' : 'Ночь'}</span>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {inventory.slice(0, 9).map((item, i) => (
          <div
            key={i}
            onClick={() => setSelectedSlot(i)}
            className={`w-16 h-16 border-4 ${
              selectedSlot === i ? 'border-white' : 'border-gray-600'
            } bg-black/70 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors`}
          >
            <span className="text-2xl">
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

      {showCrafting && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <div className="bg-[#C6C6C6] p-6 rounded-lg border-4 border-[#555555] w-96">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Верстак</h2>
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
                  className="w-16 h-16 border-4 border-[#555555] bg-[#8B8B8B]"
                />
              ))}
            </div>

            <div className="flex items-center justify-center gap-4">
              <Icon name="ArrowRight" size={32} />
              <div className="w-16 h-16 border-4 border-[#555555] bg-[#8B8B8B]" />
            </div>

            <div className="mt-4 text-sm text-gray-700">
              <p>Рецепты крафта:</p>
              <p>🪵🪵🪵 = 📦 Доски</p>
              <p>🪵📦 = 🪑 Палки</p>
              <p>📦📦📦 + 🪑🪑 = ⛏️ Кирка</p>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-8 h-8 relative">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white"></div>
          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-white"></div>
        </div>
      </div>

      <div className="absolute bottom-20 left-4 bg-black/70 p-4 rounded-lg text-white text-sm">
        <p className="font-bold mb-2">⌨️ Управление:</p>
        <p>WASD - движение</p>
        <p>Пробел - прыжок</p>
        <p>Мышь - обзор</p>
        <p>ЛКМ - разрушить блок</p>
        <p>E - верстак</p>
        <p>1-9 - выбор слота</p>
      </div>
    </div>
  );
};

export default Index;
