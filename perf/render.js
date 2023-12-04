const fs = require("fs");
const si = require("systeminformation");

const renderResults = (results) => {
  getSystemInfo().then((systemInfo) => {
    const fileSuffix =
      `${systemInfo.platform}-${systemInfo.distro}-${systemInfo.arch}-${systemInfo.release}-${systemInfo.cpu}`
        .toLowerCase()
        .replace(/ /g, "_");

    fs.writeFileSync(
      `./perf/results/b_${fileSuffix}.json`,
      JSON.stringify(results, null, 2)
    );

    const chartHtml = renderAsHTML(results, systemInfo);
    fs.writeFileSync(`./perf/results/b_${fileSuffix}.html`, chartHtml);
  });
};

const renderAsHTML = (results, systemInfo) => {
  const labels = results.map((result) => result.name);
  const data = results.map((result) => result.opsPerSecond);

  const chartHtml = `<!doctype html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Benchmark Results</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body>
        <h1 class="text-2xl font-bold">Benchmark Results</h1>
        <div class="rounded-md bg-blue-50 p-4">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg
            class="h-5 w-5 text-blue-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
        <div class="ml-3 flex-1 md:flex md:justify-between">
          <dl class="text-blue-700 grid grid-cols-2">
            <dt class="font-bold">Platform</dt>
            <dd>${systemInfo.platform}</dd>
            <dt class="font-bold">Distro</dt>
            <dd>${systemInfo.distro}</dd>
            <dt class="font-bold">Arch</dt>
            <dd>${systemInfo.arch}</dd>
            <dt class="font-bold">Release</dt>
            <dd>${systemInfo.release}</dd>
            <dt class="font-bold">CPU</dt>
            <dd>${systemInfo.cpu}</dd>
          </dl>
        </div>
      </div>
    </div>
          <canvas id="chart"></canvas>
          <script>
            const labels = ${JSON.stringify(labels)};
            const data = ${JSON.stringify(data)};
            const chart = new Chart('chart', {
              type: 'bar',
              data: {
                labels: labels,
                datasets: [
                  {
                    label: 'Ops/Second',
                    data: data,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                  },
                ],
              },
              options: {
                scales: {
                  y: {
                    beginAtZero: true,
                  },
                },
              },
            });
          </script>
        </body>
      </html>
    `;

  return chartHtml;
};

const getSystemInfo = async () => {
  const cpu = await si.cpu();
  const os = await si.osInfo();

  return {
    platform: os.platform,
    distro: os.distro,
    arch: os.arch,
    release: os.release,
    cpu: `${cpu.manufacturer} ${cpu.brand}`,
  };
};

module.exports = { renderResults };
