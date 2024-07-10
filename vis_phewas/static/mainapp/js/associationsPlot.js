export function fetchAndShowAssociations(disease) {
  fetch(`/api/get_combined_associations?disease=${disease}`)
    .then(response => response.json())
    .then(data => {
      const circosData = {
        ideograms: [],
        links: []
      };

      const genes = new Set();
      const geneInfo = {};

      data.forEach(assoc => {
        genes.add(assoc.gene1);
        genes.add(assoc.gene2);

        geneInfo[assoc.gene1] = {
          name: assoc.gene1_name,
          serotype: assoc.gene1_serotype,
          subtype: assoc.gene1_subtype
        };
        geneInfo[assoc.gene2] = {
          name: assoc.gene2_name,
          serotype: assoc.gene2_serotype,
          subtype: assoc.gene2_subtype
        };

        const color = assoc.combined_odds_ratio === 1
          ? '#800080' // Purple for OR = 1
          : assoc.combined_odds_ratio < 1
          ? `rgba(255, 0, 0, ${1 - assoc.combined_odds_ratio})` // Red gradient for OR < 1
          : `rgba(0, 0, 255, ${assoc.combined_odds_ratio - 1})`; // Blue gradient for OR > 1

        circosData.links.push({
          source: { id: assoc.gene1, start: 0, end: 500000 },
          target: { id: assoc.gene2, start: 500000, end: 1000000 },
          color: color,
          value: assoc.combined_odds_ratio,
          tooltip: `${assoc.gene1} - ${assoc.gene2}: OR = ${assoc.combined_odds_ratio.toFixed(2)}, p-value = ${assoc.combined_p_value.toExponential(2)}`
        });
      });

      const sortedGenes = Array.from(genes).sort((a, b) => {
        if (geneInfo[a].name < geneInfo[b].name) return -1;
        if (geneInfo[a].name > geneInfo[b].name) return 1;
        if (geneInfo[a].serotype < geneInfo[b].serotype) return -1;
        if (geneInfo[a].serotype > geneInfo[b].serotype) return 1;
        if (geneInfo[a].subtype < geneInfo[b].subtype) return -1;
        if (geneInfo[a].subtype > geneInfo[b].subtype) return 1;
        return 0;
      });

      sortedGenes.forEach((gene, index) => {
        circosData.ideograms.push({
          id: gene,
          name: gene,
          len: 1000000,
          color: `hsl(${(index * 360) / sortedGenes.length}, 100%, 50%)`
        });
      });

      console.log('circosData:', circosData);

      const newWindow = window.open("", "_blank", "width=900,height=900");
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Circos Plot</title>
          <script src="https://d3js.org/d3.v6.min.js"></script>
          <script src="https://cdn.rawgit.com/nicgirault/circosJS/v2/dist/circos.js"></script>
          <style>
            body {
              font-family: Arial, sans-serif;
            }
            #circosContainer {
              width: 800px;
              height: 800px;
              margin: 0 auto;
            }
            .tooltip {
              position: absolute;
              background-color: #fff;
              border: 1px solid #ccc;
              padding: 5px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              display: none;
              pointer-events: none;
            }
          </style>
        </head>
        <body>
          <div id="circosContainer"></div>
          <div id="tooltip" class="tooltip"></div>
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              const circosData = ${JSON.stringify(circosData)};
              console.log('Loaded circosData:', circosData);

              const circos = new Circos({
                container: '#circosContainer',
                width: 800,
                height: 800
              });

              circos.layout(circosData.ideograms, {
                innerRadius: 300,
                outerRadius: 400,
                labels: {
                  display: true,
                  radialOffset: 60
                },
                ticks: {
                  display: false // Set to false to hide bp labels
                }
              });

              circos.chords('links', circosData.links, {
                color: d => d.color,
                radius: 200,
                direction: 'out',
                thickness: d => d.value * 2,
                opacity: 0.7,
                tooltipContent: d => d.tooltip
              }).render();

              const tooltip = document.getElementById('tooltip');

              d3.selectAll('.chord')
                .on('mouseover', function(event, datum) {
                  tooltip.style.display = 'block';
                  tooltip.innerHTML = datum.tooltip;
                  tooltip.style.left = \`\${event.pageX + 5}px\`;
                  tooltip.style.top = \`\${event.pageY + 5}px\`;
                  d3.select(this).style('opacity', 1);
                })
                .on('mouseout', function() {
                  tooltip.style.display = 'none';
                  d3.select(this).style('opacity', 0.7);
                });

            });
          </script>
        </body>
        </html>
      `);
      newWindow.document.close();
    })
    .catch(error => {
      console.error('Error fetching or processing data:', error);
    });
}
