function fetchAndShowClusterConnections(fileName) {
  fetch(`/som/circos-plot/${fileName}`)
    .then((response) => response.json())
    .then((data) => {
      const circosData = {
        ideograms: [],
        links: [],
      };

      const clusters = new Set();

      // Process connections and extract unique clusters
      data.forEach((connection) => {
        clusters.add(connection.source);
        clusters.add(connection.target);

        circosData.links.push({
          source: connection.source,
          target: connection.target,
          value: connection.value,
          tooltip: connection.tooltip,
        });
      });

      // Create ideograms for each cluster
      clusters.forEach((cluster) => {
        circosData.ideograms.push({
          id: cluster,
          label: cluster,
          color: d3.schemeCategory10[clusters.size % 10],
        });
      });

      // Render Circos plot
      const circos = new Circos({
        container: '#circosContainer',
        width: 800,
        height: 800,
      });

      circos.layout(circosData.ideograms, {
        innerRadius: 300,
        outerRadius: 400,
        labels: { display: true, radialOffset: 60 },
        ticks: { display: false },
      });

      circos.chords('links', circosData.links, {
        color: (d) => d.color,
        thickness: (d) => d.value * 2,
        tooltipContent: (d) => d.tooltip,
      }).render();
    })
    .catch((error) => {
      console.error('Error fetching or processing cluster connections:', error);
    });
}
