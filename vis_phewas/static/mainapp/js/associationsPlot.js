import { getShowAlert } from "./utils";

// Function to fetch and show associations for a given disease
export function fetchAndShowAssociations(disease, showSubtypes) {
  // Fetch the associations for the given disease
  fetch(
    `/api/get_combined_associations?disease=${disease}&show_subtypes=${showSubtypes}`,
  )
    .then((response) => response.json())
    .then((data) => {
      // Process the data to create a Circos plot
      const circosData = {
        ideograms: [],
        links: [],
      };

      // Create a set to store unique genes and an object to store gene information
      const genes = new Set();
      const geneInfo = {};

      // Iterate over the associations and add them to the Circos data
      data.forEach((assoc) => {
        genes.add(assoc.gene1);
        genes.add(assoc.gene2);

        // Store gene information for tooltip
        geneInfo[assoc.gene1] = {
          name: assoc.gene1_name,
          serotype: assoc.gene1_serotype,
          subtype: assoc.gene1_subtype,
        };
        geneInfo[assoc.gene2] = {
          name: assoc.gene2_name,
          serotype: assoc.gene2_serotype,
          subtype: assoc.gene2_subtype,
        };

        // Set color based on odds ratio
        const color =
          assoc.combined_odds_ratio === 1
            ? "#800080" // Purple for OR = 1
            : assoc.combined_odds_ratio > 1
              ? `rgba(255, 0, 0, ${assoc.combined_odds_ratio - 1})` // Red gradient for OR > 1
              : `rgba(0, 0, 255, ${1 - assoc.combined_odds_ratio})`; // Blue gradient for OR < 1

        // Add link to Circos data
        circosData.links.push({
          source: { id: assoc.gene1, start: 0, end: 500000 },
          target: { id: assoc.gene2, start: 500000, end: 1000000 },
          color: color,
          value: assoc.combined_odds_ratio,
          oddsRatio: assoc.combined_odds_ratio,
          pValue: assoc.combined_p_value,
          tooltip: `${assoc.gene1} - ${assoc.gene2}: OR = ${assoc.combined_odds_ratio.toFixed(2)}, p-value = ${assoc.combined_p_value.toExponential(2)}`,
        });
      });

      // Sort genes alphabetically by name, serotype, and subtype
      const sortedGenes = Array.from(genes).sort((a, b) => {
        if (geneInfo[a].name < geneInfo[b].name) return -1;
        if (geneInfo[a].name > geneInfo[b].name) return 1;
        if (geneInfo[a].serotype < geneInfo[b].serotype) return -1;
        if (geneInfo[a].serotype > geneInfo[b].serotype) return 1;
        if (geneInfo[a].subtype < geneInfo[b].subtype) return -1;
        if (geneInfo[a].subtype > geneInfo[b].subtype) return 1;
        return 0;
      });

      // Function to get a shade of the base color for each gene
      // Calculate the maximum locus value for each gene category
      const maxLocusValues = {};
      sortedGenes.forEach((gene) => {
        const [gene_name, locus] = gene.split("_");
        const locusValue = parseInt(locus, 10);
        if (!isNaN(locusValue)) {
          if (!maxLocusValues[gene_name]) {
            maxLocusValues[gene_name] = locusValue;
          } else {
            maxLocusValues[gene_name] = Math.max(
              maxLocusValues[gene_name],
              locusValue,
            );
          }
        }
      });

      // Function to get a shade of the base color for each gene
      function getColor(gene) {
        const baseColors = {
          A: { h: 0, s: 100, l: 50 }, // Red
          B: { h: 240, s: 100, l: 50 }, // Blue
          C: { h: 120, s: 100, l: 50 }, // Green
          DPA1: { h: 270, s: 100, l: 50 }, // Purple
          DPB1: { h: 30, s: 100, l: 50 }, // Orange
          DQA1: { h: 60, s: 100, l: 50 }, // Yellow
          DQB1: { h: 180, s: 100, l: 50 }, // Cyan
          DRB1: { h: 300, s: 100, l: 50 }, // Magenta
        };

        // Extract the base gene name (before the underscore)
        const split_gene = gene.split("_");
        const gene_name = split_gene[0];
        const locus = parseInt(split_gene[1], 10) || 0; // Ensures locus is a number

        const baseColor = baseColors[gene_name];
        console.log("baseColor:", baseColor);

        // If the gene is not in the base colors, return a default color
        if (!baseColor) return "gray";

        // Get the maximum locus value for this gene category
        const maxLocus = maxLocusValues[gene_name] || 1; // Default to 1 to avoid division by zero

        // Normalize the locus value and calculate lightness variation
        const normalizedLocus = locus / maxLocus;
        const lightnessVariation = 40 + normalizedLocus * 40; // Map to range 40% to 80%

        // Create a spectrum color by varying the lightness of the base color
        return `hsl(${baseColor.h}, ${baseColor.s}%, ${lightnessVariation}%)`;
      }

      // Add ideograms to Circos data
      sortedGenes.forEach((gene, index) => {
        circosData.ideograms.push({
          id: gene,
          name: gene,
          label: gene.split("_")[1], // Display only serotype/subtype in the label
          len: 1000000,
          color: getColor(gene),
        });
      });

      // Display an alert if no significant associations were found
      if (circosData.ideograms.length === 0) {
        getShowAlert("No significant associations found for this disease.");
        return;
      }

      // Function to capitalize the first letter of each word
      function capitalizeWords(str) {
        return str.replace(/\b\w/g, (char) => char.toUpperCase());
      }

      // Debug output
      console.log("circosData:", circosData);

      // Open a new window and display the Circos plot
      const newWindow = window.open("", "_blank", "width=900,height=900");
      newWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Circos Plot for ${disease}</title>
                    <script src="https://d3js.org/d3.v6.min.js"></script>
                    <script src="https://cdn.rawgit.com/nicgirault/circosJS/v2/dist/circos.js"></script>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/canvg/3.0.10/umd.min.js"></script>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
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
                        #legend {
                            display: flex;
                            justify-content: center;
                            flex-wrap: wrap;
                            margin-top: 20px;
                        }
                        .legend-item {
                            display: flex;
                            align-items: center;
                            margin-right: 15px;
                        }
                        .legend-color {
                            width: 20px;
                            height: 20px;
                            margin-right: 5px;
                        }
                        .legend-gradient {
                            width: 100px;  
                            height: 20px;
                            background: linear-gradient(to right, #0000ff, #ff0404);
                            border: 1px solid #000; 
                            margin-right: 2px;
                        }
                    </style>
                </head>
                <body>
                    <button id="saveButton">Save as PNG</button>
                    <button id="showProtective">Hide Protective</button>
                    <button id="showRisk">Hide Risk</button>
                    <label for="ORfilter">Odds Ratio Filter</label>
                    <input id="ORfilter" type="range" min=0 max=10 value=1 step=0.1 />
                    <label for="pvaluefilter">P-Value Filter</label>
                    <input id="pvaluefilter" type="range" min=0 max=0.05 value=0.05 step=0.005 />
                    <div id="graphContainer">
                        <h1>Circos Plot of Significant Pairwise Allele Associations for ${capitalizeWords(disease)}</h1>
                        <h2 id="filterDetails">Filtered to OR>=0, p<=0.005</h2>
                        <div id="circosContainer"></div>
                        <div id="tooltip" class="tooltip"></div>
                        <div id="legend" class="geneNameLegend">
                            <div class="legend-item"><div class="legend-color" style="background-color: hsl(0, 100%, 50%);"></div>A</div>
                            <div class="legend-item"><div class="legend-color" style="background-color: hsl(240, 100%, 50%);"></div>B</div>
                            <div class="legend-item"><div class="legend-color" style="background-color: hsl(120, 100%, 50%);"></div>C</div>
                            <div class="legend-item"><div class="legend-color" style="background-color: hsl(270, 100%, 50%);"></div>DPA1</div>
                            <div class="legend-item"><div class="legend-color" style="background-color: hsl(30, 100%, 50%);"></div>DPB1</div>
                            <div class="legend-item"><div class="legend-color" style="background-color: hsl(60, 100%, 50%);"></div>DQA1</div>
                            <div class="legend-item"><div class="legend-color" style="background-color: hsl(180, 100%, 50%);"></div>DQB1</div>
                            <div class="legend-item"><div class="legend-color" style="background-color: hsl(300, 100%, 50%);"></div>DRB1</div>
                        </div>
                        <div class="associationLegend">
                            <div class="legend-item">
                                <div class="legend-gradient"></div>
                                <div class="legend-label">
                                Odds Ratio (Most Protective Associations (0) to Most Risky Associations
                            </div>
                        </div>
                    </div>
                    <script>
                        
                            document.addEventListener('DOMContentLoaded', function() {
                            // Set protective and risk flags to show/hide associations
                            let protective = true;
                            let risk = true;
                            let oddsRatioThreshold = 0;
                            let pValueThreshold = 0.05;
                            const circosData = ${JSON.stringify(circosData)};
                            console.log('Loaded circosData:', circosData);

                            const circos = new Circos({
                                container: '#circosContainer',
                                width: 800,
                                height: 800
                            });
                            
                            // Create the Circos plot
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
                            
                            // Add links to the Circos plot with tooltips
                            circos.chords('links', circosData.links, {
                                color: d => d.color,
                                radius: 300,
                                direction: 'out',
                                thickness: d => d.value * 2,
                                opacity: 0.7,
                                tooltipContent: d => d.tooltip
                            }).render();

                            const tooltip = document.getElementById('tooltip');
                            
                            let maxOddsRatio = 10; // Default value set initially

                            try {
                                const oddsRatios = circosData.links.map(d => d.oddsRatio);
                                if (oddsRatios.length > 0) { // Check if the array is not empty
                                    maxOddsRatio = Math.max(...oddsRatios);
                                }
                            } catch (e) {
                                console.error("Failed to calculate max odds ratio:", e);
                                // maxOddsRatio remains 10 if an error occurs
                            }
                            
                            
                            // Set the legend text based on the maximum odds ratio
                            document.querySelector('.associationLegend .legend-item .legend-label').textContent += 
                            "(" + maxOddsRatio.toPrecision(2) + ') )';

                            
                            // Sets the range of sliders based on min and max values
                            document.getElementById('ORfilter').setAttribute('min', 0);
                            document.getElementById('ORfilter').setAttribute('max', maxOddsRatio.toString());
                           
                            
                            // Display tooltips for ideograms
                            d3.selectAll('path', 'textpath')
                                .on('mouseover', function(event, datum) {
                                    tooltip.style.display = 'block';
                                    tooltip.innerHTML = datum.id;
                                    console.log('datum:', datum);                                    
                                    tooltip.style.left = event.pageX + 5 + 'px';
                                    tooltip.style.top = event.pageY + 5 + 'px';
                                    d3.select(this).style('opacity', 1);
                                })
                                .on('mousemove', function(event) {
                                    tooltip.style.left = event.pageX + 5 + 'px';
                                    tooltip.style.top = event.pageY + 5 + 'px';
                                })
                                .on('mouseout', function() {
                                    tooltip.style.display = 'none';
                                    d3.select(this).style('opacity', 0.7);
                                });
                            
                            // Display tooltips for chords
                            d3.selectAll('.chord')
                                .on('mouseover', function(event, datum) {
                                    tooltip.style.display = 'block';
                                    tooltip.innerHTML = datum.tooltip;
                                    tooltip.style.left = event.pageX + 5 + 'px';
                                    tooltip.style.top = event.pageY + 5 + 'px';
                                    d3.select(this).style('opacity', 1);
                                })
                                .on('mousemove', function(event) {
                                    tooltip.style.left = event.pageX + 5 + 'px';
                                    tooltip.style.top = event.pageY + 5 + 'px';
                                })
                                .on('mouseout', function() {
                                    tooltip.style.display = 'none';
                                    d3.select(this).style('opacity', 0.7);
                                });
                            
                            // Add save button to download the plot as a PNG image
                            document.getElementById("saveButton").addEventListener("click", function() {
                                html2canvas(document.getElementById('graphContainer')).then(function(canvas) {
                                    // Create an image element
                                    const imgURI = canvas.toDataURL("image/png");
                                    // Prompt download
                                    const a = document.createElement("a");
                                    a.setAttribute('download', 'Circos Plot'); // Set the file name for the download
                                    a.setAttribute('href', imgURI);
                                    a.setAttribute('target', '_blank');
                                    a.click();
                                });
                            });
                            
                            // Add buttons to toggle protective or risk associations
                            document.getElementById("showProtective").addEventListener("click", function() {
                                protective = !protective;
                                updateDisplay();
                                // Update the button text based on the protective flag
                                document.getElementById("showProtective").innerText = protective ? "Hide Protective" : "Show Protective";
                            });
                            
                            document.getElementById("showRisk").addEventListener("click", function() {
                                risk = !risk;
                                updateDisplay();
                                // Update the button text based on the risk flag
                                document.getElementById("showRisk").innerText = risk ? "Hide Risk" : "Show Risk";
                            });
                            
                            // Add sliders to filter by odds ratio and p-value
                            document.getElementById("ORfilter").addEventListener("input", function() {
                                // Update the odds ratio threshold
                                oddsRatioThreshold = parseFloat(this.value);
                                updateDisplay();
                                document.getElementById("filterDetails").innerText = "Filtered to OR>=" + oddsRatioThreshold + ", p<=" + pValueThreshold;
                            });
                            
                            document.getElementById("pvaluefilter").addEventListener("input", function() {
                                // Update the p-value threshold
                                pValueThreshold = parseFloat(this.value);
                                updateDisplay();
                                document.getElementById("filterDetails").innerText = "Filtered to OR>=" + oddsRatioThreshold + ", p<=" + pValueThreshold;
                            });
                            
                            circos.svg().selectAll('.circosjs-label')
                              .style('display', 'none')
                              .on('mouseover', function() {
                                d3.select(this).style('display', 'block');
                              })
                              .on('mouseout', function() {
                                d3.select(this).style('display', 'none');
                              });
                            
                            // Function to update the display based on the filters
                            function updateDisplay() {
                                d3.selectAll('.chord')
                                    .style('display', d => {
                                        const isRisk = d.value >= 1;
                                        const isProtective = d.value < 1;
                                        const passesRiskFilter = risk && isRisk;
                                        const passesProtectiveFilter = protective && isProtective;
                                        const passesOddsRatioFilter = d.oddsRatio >= oddsRatioThreshold;
                                        const passesPValueFilter = d.pValue <= pValueThreshold;
                                        return (passesRiskFilter || passesProtectiveFilter) && passesOddsRatioFilter && passesPValueFilter ? 'block' : 'none';
                                    });
                            }
                        });
                    </script>
                </body>
                </html>
            `);
      // Close the document to finish rendering
      newWindow.document.close();
    })
    // Catch any errors that occur during the fetch or processing
    .catch((error) => {
      console.error("Error fetching or processing data:", error);
    });
}
