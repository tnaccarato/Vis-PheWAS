import Graph from 'graphology';
import {Sigma} from 'sigma';
import {createNodeBorderProgram} from "@sigma/node-border";
import {
    getAddFilter,
    getApplyFilters,
    getClearFilters,
    getRemoveFilter,
    getUpdateFilterInput,
    tableSelectFilter
} from "./filter";
import {clamp, closeInfoContainer, getAdjustSigmaContainer, getExportData, getShowAlert, sizeScale} from "./utils";
import {calculateNodeColor, clickedNode, getApplyLayout, hoverOffNode, hoverOnNode} from "./graph";
import {fetchAndShowAssociations} from "./associationsPlot";

// Declare a global variable to store the show_subtypes value
let showSubtypes = true;

// Ensure the DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Get DOM elements
    const container = document.getElementById('sigma-container');
    const graph = new Graph({multi: true});
    const sigmaInstance = new Sigma(graph, container, {
            allowInvalidContainer: true, labelRenderedSizeThreshold: 500, defaultNodeType: "bordered",
            nodeProgramClasses: {
                bordered: createNodeBorderProgram({
                    borders: [
                        {size: {attribute: "borderSize", defaultValue: 0.5}, color: {attribute: "borderColor"}},
                        {size: {fill: true}, color: {attribute: "color"}},
                    ],
                }),
            }
        })
    ;
    window.updateFilterInput = getUpdateFilterInput(adjustSigmaContainerHeight);
    window.addFilter = getAddFilter(adjustSigmaContainerHeight);
    window.removeFilter = getRemoveFilter(adjustSigmaContainerHeight)
    window.fetchAndShowAssociations = fetchAndShowAssociations;

    function adjustSigmaContainerHeight() {
        getAdjustSigmaContainer(container, sigmaInstance);
    }

    window.applyFilters = getApplyFilters(showAlert, fetchGraphData, sigmaInstance);
    window.clearFilters = getClearFilters(adjustSigmaContainerHeight, showAlert, fetchGraphData);

    // Function to update global variable show_subtypes
    function updateShowSubtypes() {
        showSubtypes = !showSubtypes;
        // Toggle the button state
        const showSubtypesButton = document.getElementById('show-subtypes-button');
        console.log('Show subtypes:', showSubtypes); // Debugging log
        // Grey out the button if show_subtypes is false
        showSubtypesButton.classList.toggle('btn-secondary', !showSubtypes);
        // Update the graph data with the new show_subtypes value
        fetchGraphData();
        sigmaInstance.refresh()
    }

    window.updateShowSubtypes = updateShowSubtypes;

    // Fetch the graph data on page load
    fetchGraphData()


    // Function to fetch graph data from the API
    function fetchGraphData(params = {}) {
        // Add the show_subtypes parameter to the params object
        params.show_subtypes = showSubtypes;
        console.log('Params:', params); // Debugging log
        const query = new URLSearchParams(params).toString();
        const url = '/api/graph-data/' + (query ? '?' + query : '');

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (params.type) {
                    updateGraph(data.nodes, data.edges, data.visible, params.clicked);
                } else {
                    initializeGraph(data.nodes, data.edges, data.visible);
                }
            })
            .catch(error => console.error('Error loading graph data:', error));
    }

    // Function to initialize the graph
    function initializeGraph(nodes, edges, visible) {
        // Ensure the container is correctly referenced, assuming it has a valid ID or declared properly
        const container = document.getElementById('sigma-container'); // Adjust according to your actual container ID or variable

        // Calculate center and radius based on container dimensions
        const centerX = container.offsetWidth / 2;
        const centerY = container.offsetHeight / 2;
        const radius = Math.min(centerX, centerY) - 100; // Adjusting radius to ensure nodes don't touch the edges

        // Clear any existing graph data
        graph.clear();

        // Loop through nodes to position them in a circle starting at 12 o'clock
        nodes.forEach((node, nodeNumber) => {
            if (!node in visible) {
                return;
            }
            if (!graph.hasNode(node.id)) {
                // Calculate the angle with an offset to start at 12 o'clock
                const angle = (2 * Math.PI * nodeNumber / nodes.length) - Math.PI / 2;
                // Calculate x and y coordinates based on the angle
                const x = centerX + radius * Math.cos(angle);
                const y = centerY - radius * Math.sin(angle); // Inverted y-axis to start at 12 o'clock

                // Get the color of the node based on its node type
                const color = getNodeColor(node);

                // Debugging log to check angles and positions
                console.log(`Node ${node.id}: angle ${angle} radians, x: ${x}, y: ${y}`);

                // Add node to the graph with calculated positions
                graph.addNode(node.id, {

                    label: node.label.replace('HLA_', ''), // Assuming label cleanup
                    full_label: node.label,
                    node_type: node.node_type,
                    forceLabel: true, // Force label display for category nodes
                    x: x,
                    y: y,
                    size: 8,
                    borderColor: color,
                    borderSize: 0,
                    hidden: false,
                    color: color,
                });
            }
        });


        edges.forEach(edge => {
            if (!graph.hasEdge(edge.id)) {
                graph.addEdge(edge.source, edge.target);
                graph.setEdgeAttribute(edge.source, edge.target, 'hidden', false);
                console.log('Edge:', edge); // Debugging log
            }
        });


    }

    // Function to update the graph with new nodes and edges
    function updateGraph(nodes, edges, visible, clicked) {
        console.log(visible)
        // Get all nodes and edges in the graph
        const graphNodes = graph.nodes();
        const graphEdges = graph.edges();

        if (!clicked) {
            // Hide all nodes and edges
            graphNodes.forEach(node => {
                    graph.setNodeAttribute(node, 'hidden', true);
                }
            );
            graphEdges.forEach(edge => {
                    graph.setEdgeAttribute(edge, 'hidden', true);
                }
            );

            sigmaInstance.refresh()
        }
        nodes.forEach(node => {
            console.log('Node:', node); // Debugging log
            console.log('Node P:', node.p); // Debugging log
            console.log('Node Size:', sizeScale(clamp(node.p, sizeScale.domain))); // Debugging log
            if (!graph.hasNode(node.id)) {
                const color = getNodeColor(node);
                graph.addNode(node.id, {
                    label: node.label.replace('HLA_', ''),
                    full_label: node.label,
                    node_type: node.node_type,
                    x: Math.random() * 100,
                    y: Math.random() * 100,
                    // Clamp the node size to avoid outlying values
                    size: node.node_type === 'allele' ? sizeScale(clamp(node.p, sizeScale.domain())) : 6,
                    // If there is an odds_ratio attribute in the node data, add it here
                    odds_ratio: node.node_type === 'allele' ? node.odds_ratio : null,
                    // If disease node, get the number of alleles associated with the disease
                    allele_count: node.node_type === 'disease' ? node.allele_count : null,
                    borderColor: color,
                    color: color,
                    expanded: false, // Default expanded state
                });
            }
            graph.setNodeAttribute(node.id, 'hidden', visible.includes(node.id));
        });

        edges.forEach(edge => {
            if (!graph.hasEdge(edge.id)) {
                graph.addEdge(edge.source, edge.target, {'color': 'darkgrey'});
            }
        });

        applyLayout();
    }

    // Function to calculate the color of a node based on its node type
    function getNodeColor(node) {
        return calculateNodeColor(node);
    }

    // Function to apply the layout to the graph
    function applyLayout() {
        getApplyLayout(graph, sigmaInstance);
    }


    function getInfoTable(nodeData) {
        const infoContainer = document.getElementsByClassName('info-container')[0];
        console.log('Node data:', nodeData); // Debugging log
        const selectedNode = `${nodeData.node_type}-${nodeData.full_label}`;
        console.log('Selected node:', selectedNode); // Debugging log

        // Get edges connected to the node
        const edges = graph.edges().filter(edge => {
            const source = graph.source(edge);
            const target = graph.target(edge);
            console.log(`Edge: ${edge}, Source: ${source}, Target: ${target}`);
            return source === selectedNode || target === selectedNode;
        });
        console.log('Edges:', edges); // Debugging log

        // Gets the disease nodes connected to the allele node
        const diseaseNodes = edges.map(edge => {
            return graph.source(edge) === selectedNode ? graph.target(edge) : graph.source(edge);
        });
        console.log(diseaseNodes);

        if (diseaseNodes.length === 0) {
            console.error('No disease nodes found.');
            return;
        }

        let currentIndex = 0;

        // Clear the container
        infoContainer.innerHTML = '';

        const closeButton = document.createElement('button');
        closeButton.className = 'btn btn-danger';
        closeButton.textContent = 'X';
        closeButton.onclick = closeInfoContainer(adjustSigmaContainerHeight);
        infoContainer.appendChild(closeButton);

        const title = document.createElement('h3');
        title.textContent = nodeData.full_label + ' Information';
        title.style.textAlign = 'center';
        infoContainer.appendChild(title);

        // Add a button to filter all diseases with the allele
        const filterButton = document.createElement('button');
        filterButton.className = 'btn btn-primary';
        filterButton.textContent = 'Show All Diseases with Allele';
        filterButton.style.justifyContent = 'center';
        filterButton.onclick = () => {
            tableSelectFilter({field: 'snp', value: nodeData.full_label}, fetchGraphData, sigmaInstance, showAlert)
        }
        infoContainer.appendChild(filterButton);


        const navContainer = document.createElement('div');
        navContainer.style.display = 'flex';
        navContainer.style.justifyContent = 'space-between';
        navContainer.style.marginBottom = '10px';

        if (diseaseNodes.length > 1) {
            // Add a button to navigate to the previous disease node
            const prevButton = document.createElement('button');
            prevButton.className = 'btn btn-secondary';
            prevButton.textContent = '<';
            prevButton.onclick = () => {
                console.log('Current index:', currentIndex); // Debugging log
                currentIndex = (currentIndex - 1 + diseaseNodes.length) % diseaseNodes.length;
                console.log('Previous index:', currentIndex); // Debugging log
                displayNodeInfo(diseaseNodes[currentIndex]);
            };
            navContainer.appendChild(prevButton);

            // Add a button to navigate to the next disease node
            const nextButton = document.createElement('button');
            nextButton.className = 'btn btn-secondary';
            nextButton.textContent = '>';
            nextButton.onclick = () => {
                console.log('Current index:', currentIndex); // Debugging log
                currentIndex = (currentIndex + 1) % diseaseNodes.length;
                console.log('Next index:', currentIndex); // Debugging log
                displayNodeInfo(diseaseNodes[currentIndex]);
            };
            navContainer.appendChild(nextButton);
        }

        infoContainer.appendChild(navContainer);

        function displayOddsTables(data) {
            const {top_odds, lowest_odds} = data;

            function createOddsTable(oddsData, heading) {
                // Create and append heading
                const oddsHead = document.createElement('h4');
                oddsHead.textContent = heading;
                oddsHead.style.textAlign = 'center';
                infoContainer.appendChild(oddsHead);

                // Create the table element
                const table = document.createElement('table');
                table.className = 'odds-table table table-striped table-bordered table-hover table-sm';

                // Create the header row
                const headerRow = document.createElement('tr');
                const header1 = document.createElement('th');
                header1.textContent = 'Disease';
                headerRow.appendChild(header1);
                const header2 = document.createElement('th');
                header2.textContent = 'Odds Ratio';
                headerRow.appendChild(header2);
                const header3 = document.createElement('th');
                header3.textContent = 'P-Value';
                headerRow.appendChild(header3);
                table.appendChild(headerRow);

                // Unpack the odds object and add each key-value pair as a row in the table
                oddsData.forEach(odds => {
                    const row = document.createElement('tr');
                    const diseaseCell = document.createElement('td');
                    diseaseCell.textContent = odds.phewas_string;
                    row.appendChild(diseaseCell);
                    const oddsCell = document.createElement('td');
                    oddsCell.textContent = odds.odds_ratio.toString();
                    row.appendChild(oddsCell);
                    const pValueCell = document.createElement('td');
                    pValueCell.textContent = odds.p.toString();
                    row.appendChild(pValueCell);
                    row.onclick = () => {
                        tableSelectFilter({
                            field: 'phewas_string',
                            value: odds.phewas_string
                        }, fetchGraphData, sigmaInstance, showAlert)
                    }
                    table.appendChild(row);
                });

                infoContainer.appendChild(table);
            }

            createOddsTable(top_odds, 'Most Affected Diseases');
            createOddsTable(lowest_odds, 'Most Protective Diseases');
        }

        function displayNodeInfo(diseaseNode) {
            // Clear previous data related to disease info
            const existingDiseaseInfo = infoContainer.querySelector('.disease-info');
            console.log('Existing disease info:', existingDiseaseInfo); // Debugging log

            // Fetch data from the API for the disease
            const disease = graph.getNodeAttributes(diseaseNode).full_label;
            if (!disease) {
                console.error('Disease is null or undefined');
                return;
            }
            const encodedAllele = encodeURIComponent(nodeData.full_label);
            const encodedDisease = encodeURIComponent(disease);
            console.log(`Fetching data for allele: ${nodeData.full_label}, disease: ${disease}`); // Log query parameters
            const url = `/api/get-info/?allele=${encodedAllele}&disease=${encodedDisease}`;

            function updateNodeStyle(data) {
                // Update the allele node with the data from the API
                const alleleNode = `${nodeData.node_type}-${nodeData.full_label}`;
                graph.setNodeAttribute(alleleNode, 'odds_ratio', data.odds_ratio);
                graph.setNodeAttribute(alleleNode, 'p', data.p);
                graph.setNodeAttribute(alleleNode, 'color', getNodeColor(nodeData));
                graph.setNodeAttribute(alleleNode, 'size', sizeScale(clamp(data.p, sizeScale.domain())));
                console.log('Updated node:', graph.getNodeAttributes(alleleNode)); // Debugging log

                // Change border of disease nodes back to default
                graph.nodes().forEach(node => {
                        graph.setNodeAttribute(node, 'borderSize', 0);
                        graph.setNodeAttribute(node, 'borderColor', getNodeColor(graph.getNodeAttributes(node)));
                        graph.setNodeAttribute(node, 'forceLabel', false); // Disable force label for all disease nodes
                    }
                );
                // Change border of selected disease node to black to highlight it
                graph.setNodeAttribute(diseaseNode, 'borderSize', 0.1);
                graph.setNodeAttribute(diseaseNode, 'borderColor', 'black');
                graph.setNodeAttribute(diseaseNode, 'forceLabel', true); // Force label display for selected disease node
                sigmaInstance.refresh();
            }

            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.error) {
                        throw new Error(data.error);
                    }

                    // Create a table for the disease-specific info
                    const table = document.createElement('table');
                    table.className = 'disease-info allele-info-table table table-striped table-bordered table-hover table-sm';
                    const headerRow = document.createElement('tr');
                    const header1 = document.createElement('th');
                    header1.textContent = 'Field';
                    headerRow.appendChild(header1);
                    const header2 = document.createElement('th');
                    header2.textContent = 'Value';
                    headerRow.appendChild(header2);
                    table.appendChild(headerRow);

                    // Loop through the otherData object and add each key-value pair as a row in the table
                    Object.entries(data).forEach(([key, value]) => {
                        if (key !== 'top_odds' && key !== 'lowest_odds') {
                            const row = document.createElement('tr');
                            const cell1 = document.createElement('td');
                            cell1.textContent = key;
                            row.appendChild(cell1);
                            const cell2 = document.createElement('td');
                            cell2.textContent = value;
                            row.appendChild(cell2);
                            // If the key is disease, add a button to show associations for the disease in the Circos plot
                            if (key === 'phewas_string') {
                                const cell3 = document.createElement('td');
                                const button = document.createElement('button');
                                button.className = 'btn btn-primary';
                                button.textContent = 'Show Combinational Associations';
                                button.onclick = () => {
                                    fetchAndShowAssociations(value, showSubtypes);
                                }
                                cell3.appendChild(button);
                                row.appendChild(cell3);
                            }
                            table.appendChild(row);
                        }
                    });

                    infoContainer.style.overflowY = 'auto';
                    // If there is existing disease info, replace it with the new table and update the allele with new color and size from the data
                    if (existingDiseaseInfo) {
                        existingDiseaseInfo.replaceWith(table);
                    }
                    // Otherwise, append the new table to the container
                    else {
                        infoContainer.appendChild(table);
                    }
                    // Update the allele node attributes with the data from the API
                    updateNodeStyle(data);
                })
                .catch(error => {
                    console.error('Error loading disease info:', error);
                    const errorMessage = document.createElement('div');
                    errorMessage.className = 'disease-info alert alert-danger';
                    errorMessage.textContent = `Error loading disease info: ${error.message}`;
                    infoContainer.appendChild(errorMessage);
                });
        }

        // Display the initial node info
        displayNodeInfo(diseaseNodes[currentIndex]);

        // Fetch and display the odds data (common for all disease nodes)
        const encodedAllele = encodeURIComponent(nodeData.full_label);
        const encodedDisease = encodeURIComponent(graph.getNodeAttributes(diseaseNodes[currentIndex]).full_label);
        const url = `/api/get-info/?allele=${encodedAllele}&disease=${encodedDisease}`;

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }

                displayOddsTables(data);
            })
            .catch(error => {
                console.error('Error loading allele info:', error);
                const errorMessage = document.createElement('div');
                errorMessage.className = 'alert alert-danger';
                errorMessage.textContent = `Error loading allele info: ${error.message}`;
                infoContainer.appendChild(errorMessage);
            });
    }


    sigmaInstance.on('clickNode', ({node}) => {
            clickedNode(graph, node, fetchGraphData, adjustSigmaContainerHeight, getInfoTable);
        }
    );

    sigmaInstance.on('enterNode', ({node}) => {
        hoverOnNode(node, graph, sigmaInstance);
    });

// Event listener for when a node hover ends
    sigmaInstance.on('leaveNode', ({node}) => {
        hoverOffNode(node, graph, sigmaInstance);
    });

    // Exports the current query to a CSV file
    window.exportQuery = function () {
        getExportData(showAlert);
    };

    // Function to show an alert message
    function showAlert(message) {
        getShowAlert(message);
    }
});



