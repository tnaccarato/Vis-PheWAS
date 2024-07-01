import re
import urllib.parse
from io import StringIO

import pandas as pd
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods

from .models import HlaPheWasCatalog


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
    show_subtypes = request.GET.get('show_subtypes') == 'true'
    # print("Show subtypes:", show_subtypes)
    if filters == ['']:
        filters = []

    if data_type == 'initial':
        nodes, edges, visible = get_category_data(filters)
    elif data_type == 'diseases':
        category_id = request.GET.get('category_id')
        nodes, edges, visible = get_disease_data(category_id, filters)
    elif data_type == 'alleles':
        disease_id = urllib.parse.unquote(request.GET.get('disease_id'))
        nodes, edges, visible = get_allele_data(disease_id, filters, show_subtypes)
    else:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    return JsonResponse({'nodes': nodes, 'edges': edges, 'visible': visible})


def apply_filters(queryset, filters):
    """
    Apply filters to the queryset based on the provided filter strings.
    :param queryset:
    :param filters:
    :return:
    """
    # print("Initial queryset length:", queryset.count())
    # print("Filters:", filters)

    # If no filters are provided, return the queryset as is
    if not filters:
        return queryset.filter(p__lte=0.05)

    print(filters)

    filter_list = parse_filters(filters)

    # Process each filter
    for filter_str in filter_list:
        print(f"Original filter string: {filter_str.strip()}")

        # Split the filter string by the first two colons
        field, operator, value = filter_str.split(':', 2)

        print(f"Field: {field}, Operator: {operator}, Value: {value}")

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

    # Ensure to apply the final filter condition after all filters
    filtered_queryset = queryset.filter(p__lte=0.05)
    print("Filtered queryset length:", filtered_queryset.count())

    # Debug: print the SQL query being executed
    # print("SQL Query:", str(filtered_queryset.query))

    # Return the filtered queryset
    return filtered_queryset


def parse_filters(filters):
    """
    Parse the filters string into a list of filter strings. Each filter string is separated by a comma.

    :param filters: The filters string to parse.
    :return:
    """
    # Initialize an empty list to hold the filters
    filter_list = []
    buffer = []
    colon_count = 0

    # Parse the string manually
    for char in filters:
        if char == ':':
            colon_count += 1
        if char == ',' and colon_count < 2:
            # End of one filter segment
            filter_list.append(''.join(buffer).strip())
            buffer = []
            colon_count = 0
        else:
            buffer.append(char)

    # Append the last filter in the buffer
    if buffer:
        filter_list.append(''.join(buffer).strip())

    # Return the list of filter strings
    return filter_list


def get_category_data(filters) -> tuple:
    """
    Get the category data for the graph.
    :param filters:
    :return:
    """
    queryset = HlaPheWasCatalog.objects.values('category_string').distinct()
    filtered_queryset = apply_filters(queryset, filters)
    visible_nodes = list(filtered_queryset.values('category_string').distinct())

    # Sort the queryset by category_string
    filtered_queryset = filtered_queryset.order_by('category_string')
    nodes = [{'id': f"cat-{category['category_string'].replace(' ', '_')}", 'label': category['category_string'],
              'node_type': 'category'} for category in filtered_queryset]
    edges = []
    return nodes, edges, visible_nodes


def get_disease_data(category_id, filters) -> tuple:
    """
    Get the disease data for the selected category.
    :param category_id:
    :param filters:
    :return:
    """
    # print(filters)
    category_string = category_id.replace('cat-', '').replace('_', ' ')
    queryset = HlaPheWasCatalog.objects.filter(category_string=category_string).values('phewas_string').distinct()
    filtered_queryset = apply_filters(queryset, filters)
    visible_nodes = list(filtered_queryset.values('phewas_string', 'category_string').distinct())
    # Sort the queryset by phewas_string
    filtered_queryset = filtered_queryset.order_by('phewas_string')
    nodes = [{'id': f"disease-{disease['phewas_string'].replace(' ', '_')}", 'label': disease['phewas_string'],
              'node_type': 'disease'} for disease in filtered_queryset]
    edges = [{'source': category_id, 'target': f"disease-{disease['phewas_string'].replace(' ', '_')}"} for disease in
             filtered_queryset]
    return nodes, edges, visible_nodes


def get_allele_data(disease_id, filters, show_subtypes=True) -> tuple:
    """
    Get the allele data for the selected disease.
    :param disease_id:
    :param filters:
    :param show_subtypes: Whether to show the subtypes of the alleles or just the main groups
    :return:
    """
    disease_string = disease_id.replace('disease-', '').replace('_', ' ')
    if show_subtypes:
        # print("Showing subtypes")
        queryset = HlaPheWasCatalog.objects.filter(phewas_string=disease_string).values(
            'snp', 'gene_class', 'gene_name', 'a1', 'a2', 'cases', 'controls', 'p', 'odds_ratio', 'l95', 'u95', 'maf'
        ).exclude(subtype='00').distinct()
    else:
        # print("Showing only main groups")
        queryset = HlaPheWasCatalog.objects.filter(phewas_string=disease_string, subtype='00').values(
            'snp', 'gene_class', 'gene_name', 'a1', 'a2', 'cases', 'controls', 'p', 'odds_ratio', 'l95', 'u95', 'maf'
        ).distinct()
    # Apply filters before slicing
    # Remove snp from filters list so other snps are still shown
    filters = ",".join([f for f in filters.split(',') if not f.startswith('snp')])
    #
    filtered_queryset = apply_filters(queryset, filters)
    visible_nodes = list(filtered_queryset.values('snp', 'phewas_string', 'category_string').distinct())
    # Order by odds_ratio and then slice
    filtered_queryset = filtered_queryset.order_by('-odds_ratio')
    # Annotate node with odds_ratio for dynamic node colouring
    nodes = [
        {'id': f"allele-{allele['snp'].replace(' ', '_')}", 'label': allele['snp'], 'node_type': 'allele', **allele,
         } for allele in filtered_queryset]
    edges = [{'source': disease_id, 'target': f"allele-{allele['snp'].replace(' ', '_')}"} for allele in
             filtered_queryset]
    return nodes, edges, visible_nodes


def get_info(request) -> JsonResponse:
    """
    Get the allele data for the selected allele.
    :param request:
    :return: JsonResponse with the allele data
    """
    # Get allele from request
    allele = request.GET.get('allele')
    # Get the disease from the request
    disease = request.GET.get('disease')
    # Debug: print the allele and disease
    print("Allele:", allele)
    print("Disease:", disease)
    # Get the allele data
    allele_data = HlaPheWasCatalog.objects.filter(snp=allele, phewas_string=disease).values(
        'gene_class', 'gene_name', 'serotype', 'subtype', 'phewas_string', 'category_string', 'a1', 'a2', 'cases',
        'controls', 'odds_ratio', 'p', 'l95', 'u95', 'maf',
    ).distinct()[0]
    print(allele_data)
    if allele_data['subtype'] == '00':
        allele_data.pop('subtype')
    # Gets the 5 highest odds_ratio values for the allele annotated with the disease
    top_odds = HlaPheWasCatalog.objects.filter(snp=allele, p__lte=0.05).values('phewas_string', 'odds_ratio',
                                                                               'p').order_by(
        '-odds_ratio')[:5]
    print(top_odds)
    # Gets the lowest non-zero odds_ratio values for the allele annotated with the disease
    lowest_odds = HlaPheWasCatalog.objects.filter(snp=allele, odds_ratio__gt=0, p__lte=0.05).values('phewas_string',
                                                                                                    'odds_ratio',
                                                                                                    'p').order_by(
        'odds_ratio', 'p')[:5]
    print(lowest_odds)
    allele_data['top_odds'] = list(top_odds)
    allele_data['lowest_odds'] = list(lowest_odds)
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
