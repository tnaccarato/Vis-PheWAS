import itertools
import re
import urllib.parse
from io import StringIO

import pandas as pd
from django.db import models
from django.db.models import Q
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods
from scipy.stats import combine_pvalues

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


def apply_filters(queryset, filters, category_id=None):
    if category_id:
        category_string = category_id.replace('cat-', '').replace('_', ' ')
        queryset = queryset.filter(category_string=category_string)

    if not filters:
        return queryset.filter(p__lte=0.05)

    filter_list = parse_filters(filters)

    combined_query = Q()

    for logical_operator, filter_str in filter_list:
        print(f"Processing filter: {logical_operator} {filter_str}")
        parts = filter_str.split(':', 2)
        if len(parts) < 3:
            continue
        field, operator, value = parts

        # Remove any trailing commas from the value
        value = value.rstrip(',')

        if operator == '==':
            q = Q(**{f'{field}__iexact': value})
        elif operator == 'contains':
            q = Q(**{f'{field}__icontains': value})
        elif operator == '>':
            q = Q(**{f'{field}__gt': value})
        elif operator == '<':
            q = Q(**{f'{field}__lt': value})
        elif operator == '>=':
            q = Q(**{f'{field}__gte': value})
        elif operator == '<=':
            q = Q(**{f'{field}__lte': value})
        else:
            continue

        if logical_operator == 'AND':
            combined_query &= q
        elif logical_operator == 'OR':
            combined_query |= q

    queryset = queryset.filter(combined_query)

    print("SQL Query:", queryset.query)
    print("Count before p-value filter:", queryset.count())

    filtered_queryset = queryset.filter(p__lte=0.05)
    print("Final filtered count:", filtered_queryset.count())

    return filtered_queryset


def parse_filters(filters):
    print("Parsing filters:", filters)
    filter_list = []
    current_operator = None
    pattern = re.compile(r'\s*(AND|OR)\s*')
    parts = pattern.split(filters)

    for part in parts:
        part = part.strip()
        if part in ('AND', 'OR'):
            current_operator = part
        elif part:
            # Split by comma, but only if not inside quotes
            sub_parts = re.findall(r'([^,]+|"[^"]*")+', part)
            for sub_part in sub_parts:
                sub_part = sub_part.strip().strip('"')
                if current_operator:
                    filter_list.append((current_operator, sub_part))
                    current_operator = None
                else:
                    filter_list.append(('AND', sub_part))

    print("Parsed filter list:", filter_list)
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
    # Get the number of alleles associated with each disease and annotate the queryset
    filtered_queryset = filtered_queryset.annotate(allele_count=models.Count('snp'))
    visible_nodes = list(filtered_queryset.values('phewas_string', 'category_string').distinct())
    # Sort the queryset by phewas_string
    filtered_queryset = filtered_queryset.order_by('phewas_string')
    nodes = [{'id': f"disease-{disease['phewas_string'].replace(' ', '_')}", 'label': disease['phewas_string'],
              'node_type': 'disease', 'allele_count': disease['allele_count']} for disease in filtered_queryset]
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


def export_data(request):
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


def get_combined_associations(request):
    """
    Get the pairwise combined associations for all alleles for a particular disease.
    :param request:
    :return: JsonResponse
    """
    # Get the disease from the request
    disease = request.GET.get('disease')
    show_subtypes = request.GET.get('show_subtypes')

    # Get the allele data for the disease where subtype is not 00
    allele_data = HlaPheWasCatalog.objects.filter(phewas_string=disease).values(
        'snp', 'gene_name', 'serotype', 'subtype', 'odds_ratio', 'p'

    )
    if show_subtypes == 'true':
        allele_data = allele_data.exclude(subtype='00')
    else:
        allele_data = allele_data.filter(subtype='00')

    # Generate pairwise combinations of alleles
    allele_combinations = list(itertools.combinations(allele_data, 2))

    result = []

    # For each pair of alleles, calculate the combined odds ratio and p-value
    for allele1, allele2 in allele_combinations:
        combined_odds_ratio = allele1['odds_ratio'] * allele2['odds_ratio']
        # Filter out OR = 0
        if combined_odds_ratio == 0:
            continue

        # Combine p-values using Fisher's method
        _, combined_p_value = combine_pvalues([allele1['p'], allele2['p']])

        # Only keep combined associations with p-value less than 0.05
        if combined_p_value >= 0.05:
            continue

        result.append({
            'gene1': allele1['snp'].replace('HLA_', ''),
            'gene1_name': allele1['gene_name'],
            'gene1_serotype': allele1['serotype'],
            'gene1_subtype': allele1['subtype'],
            'gene2': allele2['snp'].replace('HLA_', ''),
            'gene2_name': allele2['gene_name'],
            'gene2_serotype': allele2['serotype'],
            'gene2_subtype': allele2['subtype'],
            'combined_odds_ratio': combined_odds_ratio,
            'combined_p_value': combined_p_value
        })

    return JsonResponse(result, safe=False)
