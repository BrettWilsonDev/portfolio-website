const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

ctx.strokeStyle = "rgba(204, 41, 0, 0.5)";
ctx.lineWidth = 0.35;

const speed = 0.3;

function animate(x, y, vx, vy) {
  requestAnimationFrame(() => animate(x, y, vx, vy));

  ctx.beginPath();
  ctx.moveTo(x, y);
  x += vx * speed;
  y += vy * speed;
  ctx.lineTo(x, y);
  ctx.stroke();

  if (x < 0 || x > canvas.width) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    vx = -vx; // Reverse the x direction
  }

  if (y < 0 || y > canvas.height) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    vy = -vy; // Reverse the y direction
  }
}

animate(0, 0, 1, 1); // Move diagonally from top-left to bottom-right
animate(canvas.width, canvas.height, -1, -1); // Move diagonally from bottom-right to top-left
animate(0, canvas.height, 1, -1); // Move diagonally from bottom-left to top-right
animate(canvas.width, 0, -1, 1); // Move diagonally from top-right to bottom-left



// animate(0, 0, speed, speed);
// animate(canvas.width, canvas.height, speed, speed);

// animate(0, canvas.height, speed, speed);
// animate(canvas.width, 0, speed, speed);
