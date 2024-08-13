import html
import itertools
import re
import urllib.parse
from io import StringIO

import pandas as pd
from django.db.models import Q, Count
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from mainapp.models import HlaPheWasCatalog
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from scipy.stats import combine_pvalues

from api.models import TemporaryCSVData

class IndexView(APIView):
    """
    API view to get the index page.
    """

    def get(self, request):
        return Response({"message": "Welcome to the HLA PheWAS Catalog API"}, status=status.HTTP_200_OK)


class GraphDataView(APIView):
    """
    API view to get the data for the graph.
    """

    def get(self, request):
        # Get the data type from the request
        data_type = request.GET.get('type', 'initial')
        filters = request.GET.get('filters')
        show_subtypes = request.GET.get('show_subtypes')
        if show_subtypes == 'undefined':
            show_subtypes = False
        if filters == ['']:
            filters = []

        if data_type == 'initial':
            nodes, edges, visible = get_category_data(filters, show_subtypes, initial=True)
        elif data_type == 'categories':
            nodes, edges, visible = get_category_data(filters, initial=False, show_subtypes=show_subtypes)
        elif data_type == 'diseases':
            category_id = request.GET.get('category_id')
            nodes, edges, visible = get_disease_data(category_id, filters, show_subtypes)
        elif data_type == 'alleles':
            disease_id = urllib.parse.unquote(request.GET.get('disease_id'))
            nodes, edges, visible = get_allele_data(disease_id, filters, show_subtypes)
        else:
            return Response({'error': 'Invalid request'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'nodes': nodes, 'edges': edges, 'visible': visible})


def apply_filters(queryset, filters, category_id=None, show_subtypes=False, export=False, initial=False):
    """
    Apply the filters to the queryset.
    :param initial:
    :param export:
    :param queryset:
    :param filters:
    :param category_id:
    :param show_subtypes: Whether to show the subtypes of the alleles or just the main groups
    :return: Filtered queryset
    """
    # If a category_id is provided, filter by that category
    if category_id:
        category_string = category_id.replace('category-', '').replace('_', ' ')
        queryset = queryset.filter(category_string=category_string)
    if not export and not initial:
        # Handle show_subtypes logic
        if not show_subtypes:
            queryset = queryset.filter(subtype='00')
        else:
            queryset = queryset.exclude(subtype='00')
    # Skip show_subtypes logic if exporting or initial
    else:
        queryset = queryset

    # If no filters are provided, return the queryset filtered by p-value
    if not filters:
        return queryset.filter(p__lte=0.05)

    # Parse the filters
    filter_list = parse_filters(filters)

    # Apply the filters
    combined_query = Q()

    # Loop through the filters and apply them to the queryset
    for logical_operator, filter_str in filter_list:
        parts = filter_str.split(':', 2)
        if len(parts) < 3:
            continue
        field, operator, value = parts

        # Remove any trailing commas from the value
        value = value.rstrip(',')

        # Check if the field is a valid field
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

        # Combine the query with the previous queries based on the logical operator
        if logical_operator == 'AND':
            combined_query &= q
        elif logical_operator == 'OR':
            combined_query |= q

    # Filter the queryset by the combined query
    queryset = queryset.filter(combined_query)

    # Filter the queryset by p-value
    filtered_queryset = queryset.filter(p__lte=0.05)

    # Return the filtered queryset
    return filtered_queryset


def parse_filters(filters):
    """
    Parse the filters string into a list of tuples.
    :param filters:
    :return:
    """
    # Split the filters string by AND or OR
    filter_list = []
    # Keep track of the current operator
    current_operator = None
    # Split by AND or OR, but only if not inside quotes
    pattern = re.compile(r'\s*(AND|OR)\s*')
    parts = pattern.split(filters)

    # Filter out empty strings
    for part in parts:
        part = part.strip()
        # Skip empty strings
        if part in ('AND', 'OR'):
            current_operator = part
        elif part:
            # Split by comma, but only if not inside quotes
            sub_parts = re.findall(r'([^,]+|"[^"]*")+', part)
            for sub_part in sub_parts:
                sub_part = sub_part.strip().strip('"')
                # If there is a current operator, add it to the filter list
                if current_operator:
                    filter_list.append((current_operator, sub_part))
                    current_operator = None
                # If there is no current operator, default to AND
                else:
                    filter_list.append(('AND', sub_part))

    # Return the filter list
    return filter_list


def get_category_data(filters, show_subtypes, initial=True, ) -> tuple:
    """
    Get the category data for the graph.
    :param show_subtypes:
    :param initial:
    :param filters:
    :return:
    """
    # Get the unique category strings
    queryset = HlaPheWasCatalog.objects.values('category_string').distinct()
    # Apply filters before slicing
    filtered_queryset = apply_filters(queryset, filters, initial=initial, show_subtypes=show_subtypes)
    # Get the visible nodes
    visible_nodes = list(filtered_queryset.values('category_string').distinct())
    # Get visible nodes as a list of strings
    visible_nodes = ["category-" + node['category_string'].replace(' ', '_') for node in visible_nodes]

    # Sort the queryset by category_string
    filtered_queryset = filtered_queryset.order_by('category_string')
    # Create the nodes and edges
    nodes = [{'id': f"category-{category['category_string'].replace(' ', '_')}", 'label': category['category_string'],
              'node_type': 'category'} for category in filtered_queryset]
    edges = []
    # Return the nodes, edges, and visible nodes
    return nodes, edges, visible_nodes


def get_disease_data(category_id, filters, show_subtypes) -> tuple:
    """
    Get the disease data for the selected category.
    :param show_subtypes:
    :param category_id:
    :param filters:
    :return:
    """
    category_string = category_id.replace('category-', '').replace('_', ' ')
    queryset = HlaPheWasCatalog.objects.filter(category_string=category_string).values('phewas_string',
                                                                                       'category_string').distinct()
    filtered_queryset = apply_filters(queryset, filters, show_subtypes=show_subtypes)

    # Annotation for allele count
    filtered_queryset = filtered_queryset.annotate(allele_count=Count('snp'))

    # Get the visible nodes
    visible_nodes = list(filtered_queryset.values('phewas_string', 'category_string').distinct())
    visible_nodes = ["disease-" + node['phewas_string'].replace(' ', '_') for node in visible_nodes]

    # Sort the queryset by phewas_string
    filtered_queryset = filtered_queryset.order_by('phewas_string')

    # Create the nodes and edges
    nodes = [{'id': f"disease-{disease['phewas_string'].replace(' ', '_')}", 'label': disease['phewas_string'],
              'node_type': 'disease', 'allele_count': disease['allele_count'], 'category': disease['category_string']}
             for disease in filtered_queryset]
    edges = [{'source': category_id, 'target': f"disease-{disease['phewas_string'].replace(' ', '_')}"} for disease in
             filtered_queryset]

    return nodes, edges, visible_nodes


def get_allele_data(disease_id, filters, show_subtypes=False) -> tuple:
    """
    Get the allele data for the selected disease.
    :param disease_id:
    :param filters:
    :param show_subtypes: Whether to show the subtypes of the alleles or just the main groups
    :return:
    """
    disease_string = disease_id.replace('disease-', '').replace('_', ' ')
    queryset = HlaPheWasCatalog.objects.filter(phewas_string=disease_string).values(
        'snp', 'gene_class', 'gene_name', 'a1', 'a2', 'cases', 'controls', 'p', 'odds_ratio', 'l95', 'u95', 'maf'
    ).distinct()

    # Remove snp from filters list so other snps are still shown
    filters = ",".join([f for f in filters.split(',') if not ('snp' in str(f))])
    print(filters)

    filtered_queryset = apply_filters(queryset, filters, show_subtypes=show_subtypes)

    # Get the visible nodes
    visible_nodes = list(filtered_queryset.values('snp', 'phewas_string', 'category_string').distinct())
    visible_nodes = ["allele-" + node['snp'].replace(' ', '_') for node in visible_nodes]

    # Order by odds_ratio and then slice
    filtered_queryset = filtered_queryset.order_by('-odds_ratio')

    # Annotate node with odds_ratio for dynamic node colouring
    nodes = [
        {'id': f"allele-{allele['snp'].replace(' ', '_')}", 'label': allele['snp'], 'node_type': 'allele',
         'disease': disease_string, **allele,
         } for allele in filtered_queryset]
    edges = [{'source': disease_id, 'target': f"allele-{allele['snp'].replace(' ', '_')}"} for allele in
             filtered_queryset]

    return nodes, edges, visible_nodes


class InfoView(APIView):
    """
    API view to get the information for a specific allele.
    """

    def get(self, request):
        # Get the allele and disease from the request
        allele = request.GET.get('allele')
        disease = request.GET.get('disease')
        # Get the allele data for the allele and disease
        allele_data = HlaPheWasCatalog.objects.filter(snp=allele, phewas_string=disease).values(
            'gene_class', 'gene_name', 'serotype', 'subtype', 'phewas_string', 'category_string', 'a1', 'a2', 'cases',
            'controls', 'odds_ratio', 'p', 'l95', 'u95', 'maf',
        ).distinct()[0]
        # Remove the subtype if it is the main group
        if allele_data['subtype'] == '00':
            allele_data.pop('subtype')

        # Get the top and lowest odds ratios for the allele
        top_odds = HlaPheWasCatalog.objects.filter(snp=allele, p__lte=0.05).values('phewas_string', 'odds_ratio',
                                                                                   'p').order_by(
            '-odds_ratio')[:5]
        lowest_odds = HlaPheWasCatalog.objects.filter(snp=allele, odds_ratio__gt=0, p__lte=0.05).values('phewas_string',
                                                                                                        'odds_ratio',
                                                                                                        'p').order_by(
            'odds_ratio', 'p')[:5]

        # Return the allele data
        allele_data['top_odds'] = list(top_odds)
        allele_data['lowest_odds'] = list(lowest_odds)
        return Response(allele_data)


class ExportDataView(APIView):
    """
    API view to export the data to a CSV file.
    """

    def get(self, request):
        # Get the filters from the request
        filters = request.GET.get('filters', '')
        # Get the queryset and apply the filters
        queryset = HlaPheWasCatalog.objects.all()
        filtered_queryset = apply_filters(queryset, filters, show_subtypes=True, export=True)
        # Create a DataFrame from the queryset
        df = pd.DataFrame(list(filtered_queryset.values()))
        # Drop the id column if it exists
        if 'id' in df.columns:
            df.drop(columns=['id'], inplace=True)

        # Create the response
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="exported_data.csv"'
        response['Dataset-Length'] = str(filtered_queryset.count())

        # Write the DataFrame to a CSV file
        buffer = StringIO()
        decoded_filters = html.unescape(filters)  # Unescape filters so that they are human-readable in the CSV
        buffer.write(f"Filters: {decoded_filters}\n\n")
        df.to_csv(buffer, index=False)
        csv_content = buffer.getvalue()

        # Write the CSV content to the response
        response.write(csv_content)
        # Return the response
        return response

class SendDataToSOMView(APIView):
    """
    API view to send the data to the SOM.
    """

    def get(self, request):
        # Get the filters from the request
        filters = request.GET.get('filters', '')
        # Get the SOM type from the request (disease or allele)
        som_type = request.GET.get('type')
        # Get the queryset and apply the filters
        queryset = HlaPheWasCatalog.objects.all()
        filtered_queryset = apply_filters(queryset, filters, show_subtypes=True, export=True)
        # Create a DataFrame from the queryset
        df = pd.DataFrame(list(filtered_queryset.values()))
        # Drop the id column if it exists
        if 'id' in df.columns:
            df.drop(columns=['id'], inplace=True)

        # Create a CSV in memory
        buffer = StringIO()
        df.to_csv(buffer, index=False)
        csv_content = buffer.getvalue()
        # # Save the CSV content in a file for debugging
        # with open('data.csv', 'w') as f:
        #     f.write(csv_content)


        # Save the CSV content and SOM type to the temporary model
        temp_data = TemporaryCSVData.objects.create(csv_content=csv_content, som_type=som_type)

        # Return the ID of the temporary data in the response
        return JsonResponse({'status': 'CSV data stored', 'data_id': temp_data.id})


class CombinedAssociationsView(APIView):
    """
    API view to get the combined associations for a disease.
    """

    def get(self, request):
        # Get the disease and show_subtypes from the request
        disease = request.GET.get('disease')
        show_subtypes = request.GET.get('show_subtypes')

        # Get the allele data for the disease
        allele_data = HlaPheWasCatalog.objects.filter(phewas_string=disease).values(
            'snp', 'gene_name', 'serotype', 'subtype', 'odds_ratio', 'p'
        )
        # Filter out the main groups if show_subtypes is true
        if show_subtypes == 'true':
            allele_data = allele_data.exclude(subtype='00')
        # Otherwise, only show the main groups
        else:
            allele_data = allele_data.filter(subtype='00')

        # Get all possible combinations of alleles
        allele_combinations = list(itertools.combinations(allele_data, 2))

        # Combine the p-values and calculate the combined odds ratio
        result = []
        for allele1, allele2 in allele_combinations:
            combined_odds_ratio = allele1['odds_ratio'] * allele2['odds_ratio']
            # Skip if the combined odds ratio is 0
            if combined_odds_ratio == 0:
                continue

            _, combined_p_value = combine_pvalues([allele1['p'], allele2['p']])
            # Skip if the combined p-value is greater than 0.05
            if combined_p_value >= 0.05:
                continue

            # Add the combined association to the result
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

        # Return the combined associations
        return Response(result)


class GetNodePathView(APIView):
    """
    API view to get the node path from outer level to inner level.
    """

    def get(self, request):
        # Get the disease from the request
        disease = request.GET.get('disease')
        if not disease:
            return Response({"error": "Disease parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Get the category from the database for the disease
            category = HlaPheWasCatalog.objects.filter(phewas_string=disease).values('category_string').distinct()[0][
                'category_string']
            category = f"category-{category.replace(' ', '_')}"

            disease = f"disease-{disease.replace(' ', '_')}"
            # Create the path
            path = [category, disease]

            # Return the path
            return Response({"path": path})
        except IndexError:
            return Response({"error": "Disease not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GetDiseasesForCategoryView(APIView):
    """
    API view to get the diseases for a specific category.
    """

    def get(self, request):
        # Get filters from the request
        filters = request.GET.get('filters', '')
        # Get the category from the request
        category = request.GET.get('category')
        if not category:
            return Response({"error": "Category parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Replace underscores with spaces in the category name
        category = category.replace('_', ' ')
        show_subtypes = request.GET.get('show_subtypes')
        if show_subtypes == 'undefined':
            show_subtypes = False

        try:
            # Get the diseases for the category with the selected filters
            diseases = HlaPheWasCatalog.objects.filter(category_string=category)
            # Apply the filters, including the show_subtypes logic
            diseases = apply_filters(diseases, filters, show_subtypes=show_subtypes)
            print(diseases)

            # Get the unique diseases
            diseases = diseases.values('phewas_string').distinct()
            print(diseases)
            # Sort the diseases by phewas_string
            diseases = sorted([disease['phewas_string'] for disease in diseases])
            # Return the diseases
            return Response({"diseases": diseases})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)