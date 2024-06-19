import {filters} from "./filter";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {rgbaToFloat} from "sigma/utils";
import { scaleLog } from 'd3-scale';
import {clamp, colorScale} from "./utils";

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
        // Wait for the Sigma container to resize before displaying the right column
        setTimeout(() => {
            const rightColumn = document.getElementsByClassName('col-md-6 right-column')[0]
            rightColumn.style.width = '30%';
            rightColumn.style.display = 'inline-block';
            const infoPanel = document.getElementsByClassName('info-container')[0];
            infoPanel.style.display = 'inline-block';
            getInfoTable(nodeData);
        }
        , 50);
    }
}

export function hoverOnNode(node, graph, sigmaInstance) {
    const nodeId = node;
    const edges = graph.edges().filter(edge => {
        return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
    });

    console.log('Edges:', edges); // Debugging log

    edges.forEach(edge => {
        graph.setEdgeAttribute(edge, 'color', 'black');

        // Sets the color of the target node to green
        const sourceNode = graph.source(edge);
        graph.setNodeAttribute(sourceNode, 'color', '#69fb00');

        // Sets the color of the target node to a darker green
        const targetNode = graph.target(edge);
        graph.setNodeAttribute(targetNode, 'color', '#46af01');
    });

    sigmaInstance.refresh();
}

export function hoverOffNode(node, graph, getNodeColor, sigmaInstance) {
    // Get the edges connected to the node
    const nodeId = node;
    const edges = graph.edges().filter(edge => {
        return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
    });

    edges.forEach(edge => {
        graph.setEdgeAttribute(edge, 'color', 'darkgrey');
        // Sets the color of the source and target nodes to their original color
        const sourceNode = graph.source(edge);
        const sourceNodeData = graph.getNodeAttributes(sourceNode);
        graph.setNodeAttribute(sourceNode, 'color', getNodeColor(sourceNodeData));
        const targetNode = graph.target(edge);
        const targetNodeData = graph.getNodeAttributes(targetNode);
        graph.setNodeAttribute(targetNode, 'color', getNodeColor(targetNodeData));
    });

    // Refresh the Sigma instance
    sigmaInstance.refresh();
}

export function getApplyLayout(graph, sigmaInstance) {
    const settings = {
        iterations: 100,
        settings: {
            gravity: 0.5,
            scalingRatio: 2.0,
            barnesHutOptimize: true,
            barnesHutTheta: 0.5
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
            return '#94f800';
        case 'disease':
            return '#eafa05';

        case 'allele':
            // Color the node based on allele's odds ratio on a gradient from red (higher than 1 to blue (lower than 1)
            const oddsRatio = clamp(node.odds_ratio, colorScale.domain())
            return colorScale(oddsRatio);

        default:
            return '#000000';
    }
}