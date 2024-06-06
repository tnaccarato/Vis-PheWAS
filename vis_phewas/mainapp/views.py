from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods
from .models import HlaPheWasCatalog


def index(request):
    """
    View function for the home page of the site.
    """
    return render(request, 'mainapp/index.html')


from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import HlaPheWasCatalog

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import HlaPheWasCatalog
import urllib.parse


@require_http_methods(["GET"])
def graph_data(request):
    """
    View function to return the graph data based on the request type.
    :param request:
    :return:
    """
    # Get the type of data requested
    data_type = request.GET.get('type', 'initial')
    print(f"Received request with type: {data_type}")  # Debug print statement

    # If the request is for initial data, fetch the categories
    if data_type == 'initial':
        nodes, edges = get_initial_data()
    # If the request is for diseases, fetch the diseases for the given category
    elif data_type == 'diseases':
        category_id = request.GET.get('category_id')
        print(f"Fetching diseases for category_id: {category_id}")
        nodes, edges = get_disease_data(category_id)
    # If the request is for alleles, fetch the alleles for the given disease
    elif data_type == 'alleles':
        disease_id = urllib.parse.unquote(request.GET.get('disease_id'))
        print(f"Fetching alleles for disease_id: {disease_id}")
        nodes, edges = get_allele_data(disease_id)
    # If the request is invalid, return an error response
    else:
        return JsonResponse({'error': 'Invalid request'}, status=400)
    # Return the nodes and edges as a JSON response
    return JsonResponse({'nodes': nodes, 'edges': edges})


def get_initial_data():
    """
    Helper function to fetch the initial data for the graph.
    :return:
    """
    # Fetch the distinct categories from the database
    categories = HlaPheWasCatalog.objects.values('category_string').distinct()
    # Initialize the nodes and edges lists
    nodes = []
    edges = []

    # Iterate over the categories and add them to the nodes list
    for category in categories:
        category_id = f"cat-{category['category_string'].replace(' ', '_')}"
        nodes.append({
            'id': category_id,
            'label': category['category_string'],
            'node_type': 'category'
        })

    print(f"Initial categories: {nodes}")
    # Return the nodes and edges lists (no edges for initial data)
    return nodes, edges


def get_disease_data(category_id):
    """
    Helper function to fetch the diseases for a given category.
    :param category_id:
    :return:
    """
    # Extract the category string from the category_id
    category_string = category_id.replace('cat-', '').replace('_', ' ')
    # Fetch the distinct diseases for the given category
    diseases = HlaPheWasCatalog.objects.filter(category_string=category_string).values('phewas_string').distinct()
    # Initialize the nodes and edges lists
    nodes = []
    edges = []

    # Iterate over the diseases and add them to the nodes list
    for disease in diseases:
        disease_id = f"disease-{disease['phewas_string'].replace(' ', '_')}"
        nodes.append({
            'id': disease_id,
            'label': disease['phewas_string'],
            'node_type': 'disease'
        })
        # Add an edge from the category to the disease
        edges.append({
            'source': category_id,
            'target': disease_id
        })

    print(f"Diseases for category {category_id}: {nodes}")
    # Return the nodes and edges lists
    return nodes, edges


def get_allele_data(disease_id):
    """
    Helper function to fetch the HLA alleles for a given disease.
    :param disease_id:
    :return:
    """
    # Extract the disease string from the disease_id
    disease_string = disease_id.replace('disease-', '').replace('_', ' ')
    # Fetch the distinct alleles for the given disease
    alleles = HlaPheWasCatalog.objects.filter(phewas_string=disease_string).values('snp').distinct()
    # Order the alleles by minor allele frequency and select the top 20
    alleles = alleles.order_by('-maf')[:20]
    nodes = []
    edges = []

    # Iterate over the alleles and add them to the nodes list
    for allele in alleles:
        allele_id = f"allele-{allele['snp'].replace(' ', '_')}"
        nodes.append({
            'id': allele_id,
            'label': allele['snp'],
            'node_type': 'allele'
        })
        edges.append({
            'source': disease_id,
            'target': allele_id
        })

    print(f"Alleles for disease {disease_id}: {nodes}")
    return nodes, edges


def get_model_fields():
    """
    Helper function to get the model fields for the HlaPheWasCatalog model.
    :return:
    """
    fields = HlaPheWasCatalog._meta.get_fields()
    field_names = [field.name for field in fields]
    return field_names
