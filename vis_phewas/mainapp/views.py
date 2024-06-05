from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods
from .models import HlaPheWasCatalog


def index(request):
    """
    View function for the home page of the site.
    """
    return render(request, 'mainapp/index.html')


@require_http_methods(["GET"])
def graph_data(request):
    """Get the data for the graph."""
    # Get the data type from the request
    data_type = request.GET.get('type', 'initial')

    # Get the data based on the data type
    if data_type == 'initial':
        nodes, edges = get_initial_data()
    elif data_type == 'diseases':
        category_id = request.GET.get('category_id')
        nodes, edges = get_disease_data(category_id)
    elif data_type == 'alleles':
        disease_id = request.GET.get('disease_id')
        nodes, edges = get_allele_data(disease_id)
    # If the data type is invalid, return an error
    else:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    # Return the nodes and edges as JSON
    return JsonResponse({'nodes': nodes, 'edges': edges})


def get_initial_data():
    """Helper function to get initial data for the graph."""
    # Get all unique disease categories
    categories = HlaPheWasCatalog.objects.values('category_string').distinct()
    # Initialize the nodes and edges lists
    nodes = []
    edges = []

    # Iterate over the categories and create nodes
    for category in categories:
        # Append the category node
        category_id = f"cat-{category['category_string'].replace(' ', '_')}"
        # Append the category node
        nodes.append({
            'id': category_id,
            'label': category['category_string'],
            'type': 'category'  # We retain the type here for coloring purposes
        })

    # Return the nodes and edges
    return nodes, edges


def get_disease_data(category_id):
    """Helper function to get disease data for a given category."""
    # Extract the category string from the category ID
    category_string = category_id.replace('cat-', '').replace('_', ' ')
    # Get all diseases for the given category
    diseases = HlaPheWasCatalog.objects.filter(category_string=category_string).values('phewas_string').distinct()
    # Initialize the nodes and edges lists
    nodes = []
    edges = []

    # Iterate over the diseases and create nodes and edges
    for disease in diseases:
        disease_id = f"disease-{disease['phewas_string'].replace(' ', '_')}"
        # Append the disease node
        nodes.append({
            'id': disease_id,
            'label': disease['phewas_string'],
            'type': 'disease'  # We retain the type here for coloring purposes
        })
        # Append the edge connecting the category and disease
        edges.append({
            'source': category_id,
            'target': disease_id
        })
    # Return the nodes and edges
    return nodes, edges


def get_allele_data(disease_id):
    """Helper function to get allele data for a given disease."""
    # Extract the disease string from the disease ID
    disease_string = disease_id.replace('disease-', '').replace('_', ' ')
    # Get all alleles for the given disease
    alleles = HlaPheWasCatalog.objects.filter(phewas_string=disease_string).values('allele_string').distinct()
    # Initialize the nodes and edges lists
    nodes = []
    edges = []

    # Iterate over the alleles and create nodes and edges
    for allele in alleles:
        # Append the allele node
        allele_id = f"allele-{allele['allele_string'].replace(' ', '_')}"
        # Append the allele node
        nodes.append({
            'id': allele_id,
            'label': allele['allele_string'],
            'type': 'allele'  # We retain the type here for coloring purposes
        })
        # Append the edge connecting the disease and allele
        edges.append({
            'source': disease_id,
            'target': allele_id
        })
    # Return the nodes and edges
    return nodes, edges
