import urllib.parse
from io import StringIO

from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods

from .models import HlaPheWasCatalog
import pandas as pd


def index(request) -> render:
    """
    View function for the index page.
    :param request:
    :return:
    """
    return render(request, 'mainapp/index.html')


@require_http_methods(["GET"])
def graph_data(request) -> JsonResponse:
    """
    View function to return the graph data in JSON format.
    :param request:
    :return:
    """
    data_type = request.GET.get('type', 'initial')
    filters = request.GET.get('filters')
    if filters == ['']:
        filters = []

    if data_type == 'initial':
        nodes, edges = get_initial_data(filters)
    elif data_type == 'diseases':
        category_id = request.GET.get('category_id')
        nodes, edges = get_disease_data(category_id, filters)
    elif data_type == 'alleles':
        disease_id = urllib.parse.unquote(request.GET.get('disease_id'))
        nodes, edges = get_allele_data(disease_id, filters)
    else:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    return JsonResponse({'nodes': nodes, 'edges': edges})


def apply_filters(queryset, filters):
    """
    Apply filters to the queryset based on the provided filter strings.
    :param queryset:
    :param filters:
    :return:
    """
    print("Initial queryset length:", len(queryset))
    print("Filters:", filters)

    # If no filters are provided, return the queryset as is
    if not filters:
        return queryset

    # Split the filters string into a list of filter strings
    filters = filters.split(',')

    # Apply each filter to the queryset
    for filter_str in filters:
        print(filter_str)
        field, operator, value = filter_str.split(':')

        # Apply the filter based on the operator
        if operator == '==':
            queryset = queryset.filter(**{f'{field}__iexact': value})
        elif operator == 'contains':
            queryset = queryset.filter(**{f'{field}__icontains': value})
        elif operator == '>':
            queryset = queryset.filter(**{f'{field}__gt': value})
        elif operator == '<':
            queryset = queryset.filter(**{f'{field}__lt': value})
        elif operator == '>=':
            queryset = queryset.filter(**{f'{field}__gte': value})
        elif operator == '<=':
            queryset = queryset.filter(**{f'{field}__lte': value})

    print("Filtered queryset length:", len(queryset))
    # Return the filtered queryset
    return queryset


def get_initial_data(filters) -> tuple:
    """
    Get the initial data for the graph.
    :param filters:
    :return:
    """
    queryset = HlaPheWasCatalog.objects.values('category_string').distinct()
    filtered_queryset = apply_filters(queryset, filters)
    nodes = [{'id': f"cat-{category['category_string'].replace(' ', '_')}", 'label': category['category_string'],
              'node_type': 'category'} for category in filtered_queryset]
    edges = []
    return nodes, edges


def get_disease_data(category_id, filters) -> tuple:
    """
    Get the disease data for the selected category.
    :param category_id:
    :param filters:
    :return:
    """
    print(filters)
    category_string = category_id.replace('cat-', '').replace('_', ' ')
    queryset = HlaPheWasCatalog.objects.filter(category_string=category_string).values('phewas_string').distinct()
    filtered_queryset = apply_filters(queryset, filters)
    nodes = [{'id': f"disease-{disease['phewas_string'].replace(' ', '_')}", 'label': disease['phewas_string'],
              'node_type': 'disease'} for disease in filtered_queryset]
    edges = [{'source': category_id, 'target': f"disease-{disease['phewas_string'].replace(' ', '_')}"} for disease in
             filtered_queryset]
    return nodes, edges


def get_allele_data(disease_id, filters) -> tuple:
    """
    Get the allele data for the selected disease.
    :param disease_id:
    :param filters:
    :return:
    """
    disease_string = disease_id.replace('disease-', '').replace('_', ' ')
    queryset = HlaPheWasCatalog.objects.filter(phewas_string=disease_string).values(
        'snp', 'gene_class', 'gene_name', 'a1', 'a2', 'cases', 'controls', 'p', 'odds_ratio', 'l95', 'u95', 'maf'
    ).distinct()
    # Apply filters before slicing
    filtered_queryset = apply_filters(queryset, filters)
    # Order by odds_ratio and then slice
    filtered_queryset = filtered_queryset.order_by('-odds_ratio')
    nodes = [
        {'id': f"allele-{allele['snp'].replace(' ', '_')}", 'label': allele['snp'], 'node_type': 'allele', **allele} for
        allele in filtered_queryset]
    edges = [{'source': disease_id, 'target': f"allele-{allele['snp'].replace(' ', '_')}"} for allele in
             filtered_queryset]
    return nodes, edges


def get_info(request) -> JsonResponse:
    """
    Get the allele data for the selected allele.
    :param request:
    :return: JsonResponse with the allele data
    """
    # Get allele from request
    allele = request.GET.get('allele')
    # Get the allele data
    allele_data = HlaPheWasCatalog.objects.filter(snp=allele).values(
        'gene_class', 'gene_name', 'serotype','subtype', 'a1', 'a2', 'cases', 'controls', 'p', 'l95', 'u95', 'maf'
    ).distinct()[0]
    if allele_data['subtype'] == '00':
        allele_data.pop('subtype')
    # Gets the 5 highest maf values for the allele annotated with the disease
    top_odds = HlaPheWasCatalog.objects.filter(snp=allele).values('phewas_string', 'odds_ratio').order_by(
        '-odds_ratio')[:5]
    allele_data['top_odds'] = list(top_odds)
    # Return the allele data in json format
    return JsonResponse(allele_data)


def export_query(request):
    """
    Export the query results to a CSV file.
    :param request:
    :return:
    """
    # Get the filters from the request
    filters = request.GET.get('filters', '')

    # Get the queryset and apply the filters
    queryset = HlaPheWasCatalog.objects.all()
    filtered_queryset = apply_filters(queryset, filters)

    # Convert the queryset to a DataFrame
    df = pd.DataFrame(list(filtered_queryset.values()))

    # Drop the 'id' column if it exists
    if 'id' in df.columns:
        df.drop(columns=['id'], inplace=True)

    # Create the HTTP response
    response = HttpResponse(content_type='text/csv')
    # Set the headers for the response
    response['Content-Disposition'] = 'attachment; filename="exported_data.csv"'
    response['Dataset-Length'] = str(filtered_queryset.count())

    # Use StringIO to write the filters at the top of the file
    buffer = StringIO()
    buffer.write(f"Filters: {filters}\n\n")
    df.to_csv(buffer, index=False)
    csv_content = buffer.getvalue()

    # Write the CSV content to the response
    response.write(csv_content)

    # Return the response
    return response
