import React, { useState, useEffect, useRef } from 'react';
import { Plus, Wifi, WifiOff, Radio, TrendingUp, Award, RotateCcw, Clock } from 'lucide-react';

const CONFIG = {
  GRID_SIZE: 200,
  CELL_SIZE: 3,
  REAL_WORLD_SIZE_CM: 200,
  WEBSOCKET_URL: 'ws://10.165.83.107:8081'
};

const realToGrid = (realPos) => ({
  x: Math.floor((realPos.x / CONFIG.REAL_WORLD_SIZE_CM) * CONFIG.GRID_SIZE),
  y: Math.floor((realPos.y / CONFIG.REAL_WORLD_SIZE_CM) * CONFIG.GRID_SIZE)
});

const HiveRouteRealPrototype = () => {
  const [wsConnected, setWsConnected] = useState(false);
  const [robots, setRobots] = useState([]);
  const [requests, setRequests] = useState([]);
  const [queuedTasks, setQueuedTasks] = useState([]);
  const [activeAuctions, setActiveAuctions] = useState({});
  const [messages, setMessages] = useState([]);
  const [pheromoneData, setPheromoneData] = useState({});
  const [stats, setStats] = useState({
    totalMessages: 0,
    auctionsCompleted: 0,
    tasksCompleted: 0
  });

  const wsRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    try {
      const ws = new WebSocket(CONFIG.WEBSOCKET_URL);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        addMessage('system', '✅ Connected to server', 'success');

        ws.send(JSON.stringify({
          type: 'dashboard_register',
          dashboardId: 'dashboard_' + Date.now()
        }));
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        addMessage('system', '❌ Disconnected from server', 'error');
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        addMessage('system', '⚠️ WebSocket error', 'error');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('WebSocket connection failed:', err);
      addMessage('system', 'Failed to connect to server', 'error');
    }
  };

  const handleWebSocketMessage = (data) => {
    setStats(prev => ({ ...prev, totalMessages: prev.totalMessages + 1 }));

    switch (data.type) {
      case 'robot_connected':
        addMessage('system', `🤖 Robot ${data.robotId} connected`, 'success');
        break;

      case 'robot_position':
        updateRobotPosition(data);
        break;

      case 'pheromone_deposit':
        updatePheromone(data);
        break;

      case 'auction_start':
        addMessage('system', `📢 Auction started: ${data.auctionId.slice(-8)}`, 'info');
        break;

      case 'auction_bid':
        handleAuctionBid(data);
        addMessage(data.robotId, `💰 Bid: ${data.bid.toFixed(2)}`, 'bid');
        break;

      case 'auction_winner':
        handleAuctionWinner(data);
        break;

      case 'task_queued':
        handleTaskQueued(data);
        addMessage('system', `⏸️ Task queued (position ${data.queuePosition})`, 'info');
        break;

      case 'task_complete':
        handleTaskComplete(data);
        addMessage(data.robotId, `✅ Task completed`, 'success');
        break;

      case 'robot_list':
        data.robots.forEach(robotId => {
          addMessage('system', `🤖 Robot ${robotId} already connected`, 'info');
        });
        break;

      default:
        console.log('Unknown message type:', data.type, data);
    }
  };

  const updateRobotPosition = (data) => {
    setRobots(prev => {
      const existing = prev.find(r => r.id === data.robotId);
      if (existing) {
        return prev.map(r => r.id === data.robotId ? {
          ...r,
          position: data.position,
          gridPosition: realToGrid(data.position),
          energy: data.energy || r.energy,
          heading: data.heading || r.heading,
          lastUpdate: Date.now()
        } : r);
      } else {
        return [...prev, {
          id: data.robotId,
          position: data.position,
          gridPosition: realToGrid(data.position),
          energy: data.energy || 100,
          heading: data.heading || 0,
          taskCount: 0,
          status: 'idle',
          currentTask: null,
          lastUpdate: Date.now()
        }];
      }
    });
  };

  const updatePheromone = (data) => {
    const gridPos = realToGrid(data.position);
    setPheromoneData(prev => {
      const newData = { ...prev };
      if (!newData[data.robotId]) {
        newData[data.robotId] = {};
      }

      const key = `${gridPos.x},${gridPos.y}`;
      newData[data.robotId][key] = data.intensity || 1.0;

      return newData;
    });
  };

  const handleAuctionBid = (data) => {
    setActiveAuctions(prev => {
      const newAuctions = { ...prev };

      if (!newAuctions[data.auctionId]) {
        newAuctions[data.auctionId] = {
          auctionId: data.auctionId,
          bids: [],
          startTime: Date.now()
        };
      }

      const existingBidIndex = newAuctions[data.auctionId].bids.findIndex(b => b.robotId === data.robotId);
      if (existingBidIndex >= 0) {
        newAuctions[data.auctionId].bids[existingBidIndex] = { robotId: data.robotId, bid: data.bid };
      } else {
        newAuctions[data.auctionId].bids.push({ robotId: data.robotId, bid: data.bid });
      }

      return newAuctions;
    });
  };

  const handleAuctionWinner = (data) => {
    addMessage('system', `🏆 Winner: ${data.winnerId} (bid: ${data.winningBid.toFixed(2)})`, 'success');

    setActiveAuctions(prev => {
      const newAuctions = { ...prev };
      if (newAuctions[data.auctionId]) {
        newAuctions[data.auctionId].winner = data.winnerId;
        newAuctions[data.auctionId].completed = true;

        setTimeout(() => {
          setActiveAuctions(curr => {
            const updated = { ...curr };
            delete updated[data.auctionId];
            return updated;
          });
        }, 3000);
      }
      return newAuctions;
    });

    setRequests(prev => prev.map(req =>
      req.id === data.auctionId ? { ...req, status: 'assigned', assignedTo: data.winnerId } : req
    ));

    setRobots(prev => prev.map(robot =>
      robot.id === data.winnerId ? { ...robot, status: 'busy', currentTask: data.auctionId } : robot
    ));

    setStats(prev => ({ ...prev, auctionsCompleted: prev.auctionsCompleted + 1 }));
  };

  const handleTaskQueued = (data) => {
    setQueuedTasks(prev => [...prev, {
      id: data.auctionId,
      task: data.task,
      queuePosition: data.queuePosition,
      timestamp: Date.now()
    }]);
  };

  const handleTaskComplete = (data) => {
    setRequests(prev => prev.filter(req => req.id !== data.taskId));
    setQueuedTasks(prev => prev.filter(task => task.id !== data.taskId));
    setStats(prev => ({ ...prev, tasksCompleted: prev.tasksCompleted + 1 }));

    setRobots(prev => prev.map(robot =>
      robot.id === data.robotId ? {
        ...robot,
        status: 'idle',
        currentTask: null,
        taskCount: (robot.taskCount || 0) + 1
      } : robot
    ));
  };

  const addMessage = (source, text, type = 'info') => {
    const msg = {
      id: Date.now() + Math.random(),
      source,
      text,
      type,
      timestamp: Date.now()
    };

    setMessages(prev => [msg, ...prev].slice(0, 100));
  };

  const sendWebSocketMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      console.log('Sent:', message);
    } else {
      addMessage('system', '⚠️ Cannot send: Not connected', 'error');
    }
  };

  const addRequest = () => {
    const getRandomPos = () => ({
      x: Math.random() * CONFIG.REAL_WORLD_SIZE_CM,
      y: Math.random() * CONFIG.REAL_WORLD_SIZE_CM
    });

    const auctionId = 'auction_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const task = {
      pickup: getRandomPos(),
      dropoff: getRandomPos()
    };

    setRequests(prev => [...prev, {
      id: auctionId,
      ...task,
      status: 'pending',
      createdAt: Date.now()
    }]);

    sendWebSocketMessage({
      type: 'auction_start',
      auctionId: auctionId,
      task: task
    });

    addMessage('system', `📦 New task created: ${auctionId.slice(-8)}`, 'info');
  };

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let i = 0; i <= CONFIG.GRID_SIZE; i += 10) {
        ctx.beginPath();
        ctx.moveTo(i * CONFIG.CELL_SIZE, 0);
        ctx.lineTo(i * CONFIG.CELL_SIZE, h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i * CONFIG.CELL_SIZE);
        ctx.lineTo(w, i * CONFIG.CELL_SIZE);
        ctx.stroke();
      }

      Object.entries(pheromoneData).forEach(([robotId, pheromones], idx) => {
        const colors = ['147, 51, 234', '239, 68, 68', '59, 130, 246', '16, 185, 129'];
        const color = colors[idx % colors.length];

        Object.entries(pheromones).forEach(([key, value]) => {
          if (value > 0.1) {
            const [x, y] = key.split(',').map(Number);
            const alpha = Math.min(value / 5, 0.5);
            ctx.fillStyle = `rgba(${color}, ${alpha})`;
            ctx.fillRect(x * CONFIG.CELL_SIZE, y * CONFIG.CELL_SIZE, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
          }
        });
      });

      requests.forEach(req => {
        const pickup = realToGrid(req.pickup);
        const dropoff = realToGrid(req.dropoff);

        ctx.fillStyle = req.status === 'assigned' ? '#fbbf24' : '#ef4444';
        ctx.beginPath();
        ctx.arc(pickup.x * CONFIG.CELL_SIZE, pickup.y * CONFIG.CELL_SIZE, 4, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(dropoff.x * CONFIG.CELL_SIZE, dropoff.y * CONFIG.CELL_SIZE, 4, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#64748b40';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pickup.x * CONFIG.CELL_SIZE, pickup.y * CONFIG.CELL_SIZE);
        ctx.lineTo(dropoff.x * CONFIG.CELL_SIZE, dropoff.y * CONFIG.CELL_SIZE);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      robots.forEach((robot, i) => {
        const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];
        const color = colors[i % colors.length];
        const pos = robot.gridPosition;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pos.x * CONFIG.CELL_SIZE, pos.y * CONFIG.CELL_SIZE, 6, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(robot.id, pos.x * CONFIG.CELL_SIZE, pos.y * CONFIG.CELL_SIZE - 12);

        const angle = robot.heading * Math.PI / 180;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos.x * CONFIG.CELL_SIZE, pos.y * CONFIG.CELL_SIZE);
        ctx.lineTo(
          pos.x * CONFIG.CELL_SIZE + Math.cos(angle) * 10,
          pos.y * CONFIG.CELL_SIZE + Math.sin(angle) * 10
        );
        ctx.stroke();
      });
    };

    draw();
    const interval = setInterval(draw, 100);
    return () => clearInterval(interval);
  }, [robots, requests, pheromoneData]);

  const activeAuctionsList = Object.values(activeAuctions);

  return (
    <div className="w-full h-screen bg-slate-950 text-white p-4">
      <div className="flex gap-4 h-full">
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                  <Radio className="w-6 h-6 text-purple-400" />
                  HiveRoute Real Prototype
                </h1>
                <p className="text-slate-400 text-sm">ESP32 Multi-Robot Coordination System</p>
              </div>
              <div className="flex items-center gap-2">
                {wsConnected ? (
                  <div className="flex items-center gap-2 text-green-400">
                    <Wifi className="w-5 h-5" />
                    <span className="text-sm">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-400">
                    <WifiOff className="w-5 h-5" />
                    <span className="text-sm">Disconnected</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 flex-1 flex items-center justify-center border border-slate-800">
            <canvas
              ref={canvasRef}
              width={CONFIG.GRID_SIZE * CONFIG.CELL_SIZE}
              height={CONFIG.GRID_SIZE * CONFIG.CELL_SIZE}
              className="border border-slate-700 rounded"
            />
          </div>

          <div className="bg-slate-900 rounded-lg p-4 flex gap-2 border border-slate-800">
            <button
              onClick={addRequest}
              disabled={!wsConnected}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
            <button
              onClick={() => {
                setRequests([]);
                setMessages([]);
                setPheromoneData({});
                setActiveAuctions({});
                setQueuedTasks([]);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded transition"
            >
              <RotateCcw className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>

        <div className="w-96 flex flex-col gap-4 overflow-auto">
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              System Stats
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Robots Online:</span>
                <span className="font-mono text-green-400">{robots.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Active Tasks:</span>
                <span className="font-mono">{requests.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Queued Tasks:</span>
                <span className="font-mono text-orange-400">{queuedTasks.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Active Auctions:</span>
                <span className="font-mono text-yellow-400">{activeAuctionsList.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Completed:</span>
                <span className="font-mono text-blue-400">{stats.tasksCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Messages:</span>
                <span className="font-mono">{stats.totalMessages}</span>
              </div>
            </div>
          </div>

          {queuedTasks.length > 0 && (
            <div className="bg-slate-900 rounded-lg p-4 border border-orange-500/50">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-400" />
                Task Queue ({queuedTasks.length})
              </h2>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {queuedTasks.map((task, idx) => (
                  <div key={task.id} className="bg-slate-800 rounded p-3">
                    <div className="text-sm text-orange-400 font-semibold mb-1">
                      #{idx + 1} - {task.id.slice(-8)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Waiting for available robot...
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeAuctionsList.length > 0 && (
            <div className="bg-slate-900 rounded-lg p-4 border border-yellow-500/50">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Award className="w-5 h-5 text-yellow-400" />
                Active Auctions ({activeAuctionsList.length})
              </h2>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {activeAuctionsList.map((auction) => (
                  <div key={auction.auctionId} className="bg-slate-800 rounded p-3">
                    <div className="text-sm text-slate-400 mb-2">
                      Task #{auction.auctionId.slice(-8)}
                    </div>
                    <div className="text-xs text-slate-500 mb-2">
                      {auction.bids.length} bid(s) received
                    </div>
                    {auction.bids.map((bid, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded text-sm mb-1 ${auction.winner === bid.robotId
                          ? 'bg-green-900/50 border border-green-500'
                          : 'bg-slate-700'
                          }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-mono">{bid.robotId}</span>
                          <span className="text-xs text-slate-400">
                            {bid.bid.toFixed(2)}
                          </span>
                        </div>
                        {auction.winner === bid.robotId && (
                          <div className="text-xs text-green-400 mt-1">★ Winner</div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <h2 className="text-lg font-semibold mb-3">Robot Status</h2>
            <div className="space-y-3">
              {robots.map((robot, i) => {
                const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500'];
                const isBusy = robot.status === 'busy' || robot.currentTask;
                return (
                  <div key={robot.id} className="bg-slate-800 rounded p-3 text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-3 h-3 rounded-full ${colors[i % colors.length]}`}></div>
                      <span className="font-semibold">{robot.id}</span>
                      <span className={`ml-auto text-xs px-2 py-1 rounded ${isBusy ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'
                        }`}>
                        {isBusy ? '🚚 BUSY' : '💤 IDLE'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                      <div>Position: ({robot.position.x.toFixed(1)}, {robot.position.y.toFixed(1)}) cm</div>
                      <div>Heading: {robot.heading.toFixed(0)}°</div>
                      <div>Energy: {robot.energy.toFixed(0)}%</div>
                      <div>Tasks Completed: {robot.taskCount || 0}</div>
                    </div>
                  </div>
                );
              })}
              {robots.length === 0 && (
                <div className="text-center text-slate-500 text-sm py-4">
                  No robots connected
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800 flex-1 overflow-hidden flex flex-col">
            <h2 className="text-lg font-semibold mb-3">Communication Log</h2>
            <div className="flex-1 overflow-auto space-y-1">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`text-xs p-2 rounded ${msg.type === 'error' ? 'bg-red-900/30 text-red-300' :
                    msg.type === 'success' ? 'bg-green-900/30 text-green-300' :
                      msg.type === 'bid' ? 'bg-yellow-900/30 text-yellow-300' :
                        'bg-slate-800 text-slate-300'
                    }`}
                >
                  <span className="font-mono text-slate-500">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                  {' '}
                  <span className="font-semibold">[{msg.source}]</span>
                  {' '}
                  {msg.text}
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-center text-slate-500 text-sm py-4">
                  No messages yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HiveRouteRealPrototype;