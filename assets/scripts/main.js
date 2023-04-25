const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

ctx.strokeStyle = "rgba(204, 41, 0, 0.5)";
ctx.lineWidth = 0.25;

// let x = Math.random() * canvas.width;
// let y = Math.random() * canvas.height;
// let vx = (Math.random() - 0.5) * 10;
// let vy = (Math.random() - 0.5) * 10;


ux = (Math.random() - 0.5) * 10;
uy = (Math.random() - 0.5) * 10;

let x = 0;
let y = 0;
// let vx = (Math.random() - 0.5) * 10;
// let vy = (Math.random() - 0.5) * 10;

let bx = canvas.width;
let by = canvas.height;
// let bvx = (Math.random() - 0.5) * 10;
// let bvy = (Math.random() - 0.5) * 10;

vx = ux;
vy = uy;
bvx = ux;
bvy = uy;

function animate() {
  requestAnimationFrame(animate);

  ctx.beginPath();
  ctx.moveTo(x, y);
  x += vx;
  y += vy;
  ctx.lineTo(x, y);
  ctx.stroke();

  if (x < 0 || x > canvas.width) {
    vx = -vx;
  }

  if (y < 0 || y > canvas.height) {
    vy = -vy;
  }
}

function banimate() {
    requestAnimationFrame(banimate);
  
    ctx.beginPath();
    ctx.moveTo(bx, by);
    bx += bvx;
    by += bvy;
    ctx.lineTo(bx, by);
    ctx.stroke();
  
    if (bx < 0 || bx > canvas.width) {
      bvx = -bvx;
    }
  
    if (by < 0 || by > canvas.height) {
      bvy = -bvy;
    }
  }

animate();
banimate()



