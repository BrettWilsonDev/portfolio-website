const whitelist = ["calc-py", "pokedexv2"]; // add the names of the projects to display
const pictureSources = ["../assets/images/calc_py.webp", "../assets/images/pokedexv2.webp"];
const urlSources = ["https://www.atbdw.com/calc-py/", "https://www.atbdw.com/pokedexv2/"];

fetch('https://api.github.com/users/brettwilsonbdw/repos')
  .then(response => response.json())
  .then(data => {
    data.filter(project => whitelist.includes(project.name)).forEach((project, index) => {
      const card = document.createElement('div');
      card.classList.add('project-card');
      card.innerHTML = `
        <img src="${pictureSources[index]}" alt="${project.name}"/>
        <div>
          <a href="${project.html_url}" target="_blank" rel="noopener">
            <h3>${project.name}</h3>
          </a>
          <p>${project.description}</p>
        </div>
        <div class="button-container">
          <a href="${urlSources[index]}" target="_blank" rel="noopener">
            <button>Visit Website</button>
          </a>
          <a href="${project.html_url}" target="_blank" rel="noopener">
            <button>GitHub Repo</button>
          </a>
        </div>
      `;
      document.querySelector('.project-container').appendChild(card);
    });
  })
  .catch(error => console.error(error));


  