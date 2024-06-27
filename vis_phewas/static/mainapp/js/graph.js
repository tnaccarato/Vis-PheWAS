import {filters} from "./filter";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {rgbaToFloat} from "sigma/utils";
import {clamp, protectiveColorScale, riskColorScale} from "./utils";

export function clickedNode(graph, node, fetchGraphData, adjustSigmaContainerHeight, getInfoTable) {
    const nodeData = graph.getNodeAttributes(node);
    if (nodeData.node_type === 'category') {
        fetchGraphData({type: 'diseases', category_id: node, filters: filters, clicked: true});
    } else if (nodeData.node_type === 'disease') {
        fetchGraphData({type: 'alleles', disease_id: encodeURIComponent(node), filters: filters, clicked: true});
    } else if (nodeData.node_type === 'allele') {
        const leftColumn = document.getElementsByClassName('col-md-6 left-column')[0]
        leftColumn.style.width = '70%';
        // Resize the Sigma container
        adjustSigmaContainerHeight();
        const rightColumn = document.getElementsByClassName('col-md-6 right-column')[0]
        rightColumn.style.width = '30%';
        rightColumn.style.display = 'inline-block';
        const infoPanel = document.getElementsByClassName('info-container')[0];
        infoPanel.style.display = 'inline-block';
        getInfoTable(nodeData);

    }
}

// Object to store the original node color before highlighting
const originalNodeColor = {};
const clickedNodeColor = {}; // Store colors set by click events

export function hoverOnNode(node, graph, sigmaInstance) {
    const nodeId = node;
    const edges = graph.edges().filter(edge => {
        return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
    });

    edges.forEach(edge => {
        graph.setEdgeAttribute(edge, 'color', 'black');

        // Sets the color of the source node to green
        const sourceNode = graph.source(edge);
        if (!originalNodeColor[sourceNode] && !clickedNodeColor[sourceNode]) {
            originalNodeColor[sourceNode] = graph.getNodeAttribute(sourceNode, 'color'); // Store the original color if not already stored and not clicked
        }
        graph.setNodeAttribute(sourceNode, 'color', '#69fb00');

        // Sets the color of the target node to a darker green
        const targetNode = graph.target(edge);
        if (!originalNodeColor[targetNode] && !clickedNodeColor[targetNode]) {
            originalNodeColor[targetNode] = graph.getNodeAttribute(targetNode, 'color'); // Store the original color if not already stored and not clicked
        }
        graph.setNodeAttribute(targetNode, 'color', '#46af01');
    });

    if (sigmaInstance && typeof sigmaInstance.refresh === 'function') {
        sigmaInstance.refresh();
    } else {
        console.error('Sigma instance or refresh method not available in hoverOnNode');
    }
}

export function hoverOffNode(node, graph, sigmaInstance) {
    if (!sigmaInstance || typeof sigmaInstance.refresh !== 'function') {
        console.error('Sigma instance or refresh method not available in hoverOffNode');
        return;
    }

    // Get the edges connected to the node
    const nodeId = node;
    const edges = graph.edges().filter(edge => {
        return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
    });

    edges.forEach(edge => {
        graph.setEdgeAttribute(edge, 'color', 'darkgrey');

        // Restore the color of the source and target nodes if not set by a click event
        const sourceNode = graph.source(edge);
        if (originalNodeColor[sourceNode] && !clickedNodeColor[sourceNode]) {
            graph.setNodeAttribute(sourceNode, 'color', originalNodeColor[sourceNode]);
            delete originalNodeColor[sourceNode]; // Remove the stored original color
        }

        const targetNode = graph.target(edge);
        if (originalNodeColor[targetNode] && !clickedNodeColor[targetNode]) {
            graph.setNodeAttribute(targetNode, 'color', originalNodeColor[targetNode]);
            delete originalNodeColor[targetNode]; // Remove the stored original color
        }
    });

    sigmaInstance.refresh();
}

// Function to handle node click
export function clickOnNode(node, graph, sigmaInstance) {
    const nodeId = node;
    clickedNodeColor[nodeId] = graph.getNodeAttribute(nodeId, 'color');
    graph.setNodeAttribute(nodeId, 'color', 'desiredColor'); // Replace 'desiredColor' with the color you want on click

    if (sigmaInstance && typeof sigmaInstance.refresh === 'function') {
        sigmaInstance.refresh();
    } else {
        console.error('Sigma instance or refresh method not available in clickOnNode');
    }
}

// Function to handle node unclick (if necessary)
export function unclickOnNode(node, graph, sigmaInstance) {
    const nodeId = node;
    if (clickedNodeColor[nodeId]) {
        graph.setNodeAttribute(nodeId, 'color', clickedNodeColor[nodeId]);
        delete clickedNodeColor[nodeId]; // Remove the stored clicked color
    }

    if (sigmaInstance && typeof sigmaInstance.refresh === 'function') {
        sigmaInstance.refresh();
    } else {
        console.error('Sigma instance or refresh method not available in unclickOnNode');
    }
}



export function getApplyLayout(graph, sigmaInstance) {
    // Retrieve nodes and sort them alphabetically by label
    const nodes = graph.nodes();
    const sortedNodes = nodes.sort((a, b) => {
        return graph.getNodeAttribute(a, 'label').localeCompare(graph.getNodeAttribute(b, 'label'));
    });

    // Apply a circular layout to the graph, ordering nodes by label clockwise alphabetically
    let angleStep = -(2 * Math.PI) / sortedNodes.length; // Negative for clockwise
    sortedNodes.forEach((node, index) => {
        // Check if node type is 'category'
        if (graph.getNodeAttribute(node, 'node_type') === 'category') {
            // Skip this node and move to the next iteration
            return;
        } else {
            // Set the position for non-category nodes in a circular layout starting from 12 o'clock
            graph.setNodeAttribute(node, 'x', 100 * Math.cos(Math.PI / 2 + angleStep * index));
            graph.setNodeAttribute(node, 'y', 100 * Math.sin(Math.PI / 2 + angleStep * index));
        }
    });

    // Apply the ForceAtlas2 layout to the graph
    const settings = {
        iterations: 100, settings: {
            gravity: 0.5, scalingRatio: 2.0, barnesHutOptimize: true, barnesHutTheta: 0.5
        }
    };
    forceAtlas2.assign(graph, settings);
    sigmaInstance.refresh();
}


export function calculateNodeColor(node) {
    if (node.hidden) {
        return rgbaToFloat(0, 0, 0, 0);
    }

    switch (node.node_type) {
        case 'category':
            return '#fa6011';
        case 'disease':
            return '#eafa05';

        case 'allele':
            // Color the node based on allele's odds ratio
            const oddsRatio = node.odds_ratio;
            if (oddsRatio === 1) {
                return '#a100f8'; // Green for neutral odds ratio (1)
            }
            // Otherwise, color the node based on the odds ratio, with red for risk and blue for protective
            else if (oddsRatio < 1) {
                return protectiveColorScale(clamp(oddsRatio, protectiveColorScale.domain()));
            } else {
                return riskColorScale(clamp(oddsRatio, riskColorScale.domain()));
            }


        default:
            return '#000000';
    }
}