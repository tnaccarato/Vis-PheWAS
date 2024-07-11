import { getShowAlert } from "./utils";

// Function to fetch and show associations for a given disease
export function fetchAndShowAssociations(disease) {
    // Fetch the associations for the given disease
    fetch(`/api/get_combined_associations?disease=${disease}`)
        .then(response => response.json())
        .then(data => {
            // Process the data to create a Circos plot
            const circosData = {
                ideograms: [],
                links: []
            };

            // Create a set to store unique genes and an object to store gene information
            const genes = new Set();
            const geneInfo = {};

            // Iterate over the associations and add them to the Circos data
            data.forEach(assoc => {
                genes.add(assoc.gene1);
                genes.add(assoc.gene2);

                // Store gene information for tooltip
                geneInfo[assoc.gene1] = {
                    name: assoc.gene1_name,
                    serotype: assoc.gene1_serotype,
                    subtype: assoc.gene1_subtype
                };
                // Store gene information for tooltip
                geneInfo[assoc.gene2] = {
                    name: assoc.gene2_name,
                    serotype: assoc.gene2_serotype,
                    subtype: assoc.gene2_subtype
                };

                // Set color based on odds ratio
                const color = assoc.combined_odds_ratio === 1
                    ? '#800080' // Purple for OR = 1
                    : assoc.combined_odds_ratio > 1
                        ? `rgba(255, 0, 0, ${assoc.combined_odds_ratio -1})` // Red gradient for OR > 1
                        : `rgba(0, 0, 255, ${1 - assoc.combined_odds_ratio })`; // Blue gradient for OR < 1

                // Add link to Circos data
                circosData.links.push({
                    source: { id: assoc.gene1, start: 0, end: 500000 },
                    target: { id: assoc.gene2, start: 500000, end: 1000000 },
                    color: color,
                    value: assoc.combined_odds_ratio,
                    tooltip: `${assoc.gene1} - ${assoc.gene2}: OR = ${assoc.combined_odds_ratio.toFixed(2)}, p-value = ${assoc.combined_p_value.toExponential(2)}`
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

            // Add ideograms to Circos data
            sortedGenes.forEach((gene, index) => {
                circosData.ideograms.push({
                    id: gene,
                    name: gene,
                    label: gene,
                    len: 1000000,
                    color: `hsl(${(index * 360) / sortedGenes.length}, 100%, 50%)`
                });
            });

            // Display an alert if no significant associations were found
            if (circosData.ideograms.length === 0) {
                getShowAlert('No significant associations found for this disease.');
                return;
            }

            // Debug output
            console.log('circosData:', circosData);

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
                    </style>
                </head>
                <body>
                    <button id="saveButton">Save as PNG</button>
<button id="showProtective">Hide Protective</button>
<button id="showRisk">Hide Risk</button>
                    <h1>Circos Plot for ${disease}</h1>
                    <div id="circosContainer"></div>
                    <div id="tooltip" class="tooltip"></div>
                    <script>
                        document.addEventListener('DOMContentLoaded', function() {
                            // Set protective and risk flags to show/hide associations
                            let protective = true;
                            let risk = true;
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

                            // Add save button to save the plot as a PNG image
                            document.getElementById("saveButton").addEventListener("click", function() {
                                const svgElement = document.querySelector("#circosContainer svg");
                                const svgData = new XMLSerializer().serializeToString(svgElement);
                                const canvas = document.createElement("canvas");
                                const context = canvas.getContext("2d");
                                const svgSize = svgElement.getBoundingClientRect();
                                canvas.width = svgSize.width;
                                canvas.height = svgSize.height;
                                const DOMURL = self.URL || self.webkitURL || self;
                                const img = new Image();
                                const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
                                const url = DOMURL.createObjectURL(svgBlob);
                                img.onload = function() {
                                    context.drawImage(img, 0, 0);
                                    DOMURL.revokeObjectURL(url);
                                    const imgURI = canvas
                                        .toDataURL("image/png")
                                        .replace("image/png", "image/octet-stream");
                                    const a = document.createElement("a");
                                    // Set the file name based on the disease name
                                    const file_name = "circos_plot_${disease.replaceAll(' ', '_')}.png";
                                    // Download the image
                                    a.setAttribute("download", file_name);
                                    a.setAttribute("href", imgURI);
                                    a.setAttribute("target", "_blank");
                                    a.click();
                                };
                                // Load the SVG data as an image
                                img.src = url;
                            });
                            
                            // Add buttons to toggle protective or risk associations
                            document.getElementById("showProtective").addEventListener("click", function() {
                                protective = !protective;
                                d3.selectAll('.chord')
                                    .style('display', d => d.value < 1 ? (protective ? 'block' : 'none') : (risk ? 'block' : 'none'));
                                // Update the button text based on the protective flag
                                document.getElementById("showProtective").innerText = protective ? "Hide Protective" : "Show Protective";
                            });
                            
                            document.getElementById("showRisk").addEventListener("click", function() {
                                risk = !risk;
                                d3.selectAll('.chord')
                                    .style('display', d => d.value > 1 ? (risk ? 'block' : 'none') : (protective ? 'block' : 'none'));
                                // Update the button text based on the risk flag
                                document.getElementById("showRisk").innerText = risk ? "Hide Risk" : "Show Risk";
                             
                                
                            });
                        });
                    </script>
                </body>
                </html>
            `);
            // Close the document to finish rendering
            newWindow.document.close();
        })
        // Catch any errors that occur during the fetch or processing
        .catch(error => {
            console.error('Error fetching or processing data:', error);
        });
}
