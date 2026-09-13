import { showToast } from '../common.js';

export function loadSampleTemplate(type) {
  if (!type) return;
  if (window.setMode) window.setMode('code');

  let sample = '';
  let title = '';

  if (type === 'radar') {
    title = 'Interactive Performance Radar';
    sample = '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Performance Radar</title>\n  <style>\n    body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }\n    canvas { background: #1e293b; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }\n    h2 { margin-bottom: 12px; font-weight: 700; letter-spacing: -0.02em; }\n  </style>\n</head>\n<body>\n  <h2>📡 Interactive Radar Chart</h2>\n  <canvas id="radar" width="340" height="340"></canvas>\n  <script>\n    const ctx = document.getElementById("radar").getContext("2d");\n    let angle = 0;\n    function draw() {\n      ctx.fillStyle = "rgba(30, 41, 59, 0.2)";\n      ctx.fillRect(0, 0, 340, 340);\n      ctx.beginPath();\n      ctx.arc(170, 170, 120, 0, Math.PI * 2);\n      ctx.strokeStyle = "#334155";\n      ctx.stroke();\n      ctx.beginPath();\n      ctx.moveTo(170, 170);\n      ctx.arc(170, 170, 120, angle, angle + 0.3);\n      ctx.fillStyle = "rgba(56, 189, 248, 0.4)";\n      ctx.fill();\n      angle += 0.04;\n      requestAnimationFrame(draw);\n    }\n    draw();\n  <\/script>\n</body>\n</html>';
  } else if (type === 'sphere') {
    title = '3D Canvas Orbit Mesh';
    sample = '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>3D Orbit Mesh</title>\n  <style>body{margin:0;background:#050505;overflow:hidden;display:flex;align-items:center;justify-content:center;height:100vh;color:#fff;font-family:sans-serif;}</style>\n</head>\n<body>\n  <canvas id="c"></canvas>\n  <script>\n    const c = document.getElementById("c"), ctx = c.getContext("2d");\n    c.width = window.innerWidth; c.height = window.innerHeight;\n    let t = 0;\n    function loop() {\n      ctx.fillStyle = "rgba(5,5,5,0.15)"; ctx.fillRect(0,0,c.width,c.height);\n      const cx = c.width/2, cy = c.height/2;\n      for (let i = 0; i < 180; i++) {\n        const rad = i * 0.1, dist = 140 + Math.sin(t + i*0.05)*40;\n        const x = cx + Math.cos(rad + t*0.5)*dist;\n        const y = cy + Math.sin(rad + t*0.3)*dist;\n        ctx.fillStyle = "hsl(" + (i*2 + t*50) + ", 80%, 65%)";\n        ctx.fillRect(x, y, 3, 3);\n      }\n      t += 0.02; requestAnimationFrame(loop);\n    }\n    loop();\n  <\/script>\n</body>\n</html>';
  } else if (type === 'game') {
    title = 'Retro Snake Mini Game';
    sample = '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Retro Snake</title>\n  <style>\n    body { background: #111827; color: #fff; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }\n    canvas { border: 2px solid #374151; background: #000; }\n  </style>\n</head>\n<body>\n  <h3>🐍 RETRO SNAKE • Arrow Keys to Move</h3>\n  <canvas id="gc" width="300" height="300"></canvas>\n  <script>\n    const cvs = document.getElementById("gc"), ctx = cvs.getContext("2d");\n    let px=10, py=10, gs=15, tc=20, ax=15, ay=15, xv=0, yv=0, trail=[], tail=5;\n    window.addEventListener("keydown", (e) => {\n      if(e.keyCode===37 && xv!==1){xv=-1;yv=0;}\n      if(e.keyCode===38 && yv!==1){xv=0;yv=-1;}\n      if(e.keyCode===39 && xv!==-1){xv=1;yv=0;}\n      if(e.keyCode===40 && yv!==-1){xv=0;yv=1;}\n    });\n    setInterval(() => {\n      px+=xv; py+=yv;\n      if(px<0)px=tc-1; if(px>tc-1)px=0; if(py<0)py=tc-1; if(py>tc-1)py=0;\n      ctx.fillStyle="#000"; ctx.fillRect(0,0,cvs.width,cvs.height);\n      ctx.fillStyle="#10b981";\n      for(let i=0;i<trail.length;i++){\n        ctx.fillRect(trail[i].x*gs,trail[i].y*gs,gs-2,gs-2);\n        if(trail[i].x===px && trail[i].y===py && (xv!==0||yv!==0)) tail=5;\n      }\n      trail.push({x:px,y:py});\n      while(trail.length>tail) trail.shift();\n      if(ax===px && ay===py){ tail++; ax=Math.floor(Math.random()*tc); ay=Math.floor(Math.random()*tc); }\n      ctx.fillStyle="#ef4444"; ctx.fillRect(ax*gs,ay*gs,gs-2,gs-2);\n    }, 1000/12);\n  <\/script>\n</body>\n</html>';
  }

  const codeArea = document.getElementById('codeArea');
  const titleInput = document.getElementById('titleInput');
  if (codeArea) codeArea.value = sample;
  if (titleInput) titleInput.value = title;
  if (window.handleCodeChange) window.handleCodeChange(sample);
  showToast('Loaded ' + title);
}
