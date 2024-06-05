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
    data_type = request.GET.get('type', 'initial')
    print(f"Received request with type: {data_type}")

    if data_type == 'initial':
        nodes, edges = get_initial_data()
    elif data_type == 'diseases':
        category_id = request.GET.get('category_id')
        print(f"Fetching diseases for category_id: {category_id}")
        nodes, edges = get_disease_data(category_id)
    elif data_type == 'alleles':
        disease_id = urllib.parse.unquote(request.GET.get('disease_id'))
        print(f"Fetching alleles for disease_id: {disease_id}")
        nodes, edges = get_allele_data(disease_id)
    else:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    return JsonResponse({'nodes': nodes, 'edges': edges})


def get_initial_data():
    categories = HlaPheWasCatalog.objects.values('category_string').distinct()
    nodes = []
    edges = []

    for category in categories:
        category_id = f"cat-{category['category_string'].replace(' ', '_')}"
        nodes.append({
            'id': category_id,
            'label': category['category_string'],
            'node_type': 'category'
        })

    print(f"Initial categories: {nodes}")
    return nodes, edges


def get_disease_data(category_id):
    category_string = category_id.replace('cat-', '').replace('_', ' ')
    diseases = HlaPheWasCatalog.objects.filter(category_string=category_string).values('phewas_string').distinct()
    nodes = []
    edges = []

    for disease in diseases:
        disease_id = f"disease-{disease['phewas_string'].replace(' ', '_')}"
        nodes.append({
            'id': disease_id,
            'label': disease['phewas_string'],
            'node_type': 'disease'
        })
        edges.append({
            'source': category_id,
            'target': disease_id
        })

    print(f"Diseases for category {category_id}: {nodes}")
    return nodes, edges


def get_allele_data(disease_id):
    disease_string = disease_id.replace('disease-', '').replace('_', ' ')
    alleles = HlaPheWasCatalog.objects.filter(phewas_string=disease_string).values('snp').distinct()
    nodes = []
    edges = []

    for allele in alleles:
        allele_id = f"allele-{allele['allele_string'].replace(' ', '_')}"
        nodes.append({
            'id': allele_id,
            'label': allele['allele_string'],
            'node_type': 'allele'
        })
        edges.append({
            'source': disease_id,
            'target': allele_id
        })

    print(f"Alleles for disease {disease_id}: {nodes}")
    return nodes, edges
