import html
import itertools
import os
import re
import urllib.parse
from datetime import timedelta
from io import StringIO
from typing import List

import pandas as pd
from api.models import TemporaryCSVData
from django.conf import settings
from django.db import transaction
from django.db.models import Q, Count, QuerySet
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from mainapp.models import HlaPheWasCatalog
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from scipy.stats import combine_pvalues


class IndexView(APIView):
    """
    API view to get the index page.
    """

    def get(self, request) -> Response:
        """
        Get the index page.
        :param request: Request object from the client
        :return: Response object with the index page
        """
        return Response({"message": "Welcome to the HLA PheWAS Catalog API"}, status=status.HTTP_200_OK)


class GraphDataView(APIView):
    """
    API view to get the data for the graph.
    :return: Response object with the graph data for the specified type
    """

    def get(self, request) -> Response:
        """
        Get the data for the graph.

        :param request: Request object from the client with the type, filters, and category_id parameters
        :return: Response object with the graph data for the specified type
        """
        data_type: str = request.GET.get('type', 'initial')
        filters = request.GET.get('filters')
        show_subtypes = request.GET.get('showSubtypes')
        if show_subtypes == 'undefined':
            show_subtypes = False
        if filters == ['']:
            filters = []

        # Get the data based on the type
        if data_type == 'initial':
            nodes, edges, visible = get_category_data(filters, show_subtypes, initial=True)
        elif data_type == 'categories':
            nodes, edges, visible = get_category_data(filters, initial=False, show_subtypes=show_subtypes)
        elif data_type == 'diseases':
            category_id: str = request.GET.get('category_id')
            nodes, edges, visible = get_disease_data(category_id, filters, show_subtypes)
        elif data_type == 'alleles':
            # Get the disease ID from the request escaped with urllib.parse.unquote
            disease_id: str = urllib.parse.unquote(request.GET.get('disease_id'))
            nodes, edges, visible = get_allele_data(disease_id, filters, show_subtypes)
        else:
            return Response({'error': 'Invalid request'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'nodes': nodes, 'edges': edges, 'visible': visible})


def normalise_snp_filter(filter_str):
    """
    Normalise a single SNP filter to be case-insensitive, handle different delimiters,
    and ensure HLA_[gene_name]_[first_two_numbers][optional_next_two_numbers] format is used only for :==: operator.
    :param filter_str: The filter string containing SNP conditions.
    :return: The normalised filter string.
    """

    def normalise_snp(snp_value, include_prefix):
        # Remove any leading 'HLA' or unnecessary delimiters
        snp_value = re.sub(r'^HLA[-_\s]?', '', snp_value, flags=re.IGNORECASE)

        # normalise delimiters to underscores
        snp_value = re.sub(r'[-\s/*]', '_', snp_value)

        # Capture the gene name and the numbers separately
        match = re.match(r'([A-Z]+\d?)[_\s-]?(\d{2})([:_\s-]?(\d{2}))?$', snp_value, flags=re.IGNORECASE)
        if match:
            gene_name = match.group(1).upper()  # Ensure gene name is uppercase
            first_two_digits = match.group(2)   # Capture the first two digits
            next_two_digits = match.group(4) if match.group(4) else ""  # Capture the next two digits if present
            result = f'{gene_name}_{first_two_digits}{next_two_digits}'
            return f'HLA_{result}' if include_prefix else result
        else:
            # If no match, return the original value (preserving the gene name normalization)
            return f'HLA_{snp_value.upper()}' if include_prefix else snp_value.upper()

    # Identify the operator and SNP part
    match = re.match(r'(snp\s*[:_-]?)((==|:==:|contains):?\s*)((?:HLA[-_ ]?)?[A-Z0-9-_\s/*:]+)', filter_str, flags=re.IGNORECASE)
    if match:
        operator = match.group(3).strip().lower()
        snp_value = match.group(4).strip()

        # Determine if the HLA prefix should be included based on the operator
        include_prefix = operator == "=="

        # normalise the SNP value
        normalised_snp = normalise_snp(snp_value, include_prefix)

        # Return the normalised condition
        return f"{match.group(1)}{operator}:{normalised_snp}"

    return filter_str  # Return the filter as-is if no match



def apply_filters(queryset: QuerySet, filters: str, category_id: str = None, show_subtypes: bool = False,
                  export: bool = False, initial: bool = False) -> QuerySet:
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
    # If the category_id is provided, filter the queryset by the category
    if category_id:
        category_string: str = category_id.replace('category-', '').replace('_', ' ')
        queryset = queryset.filter(category_string=category_string)
    # If the export flag is set, return the queryset without any filters
    if not export and not initial:
        # If the show_subtypes flag is set, filter the queryset to show only the main groups
        if show_subtypes == 'false':
            queryset = queryset.filter(subtype='00')
            # If show_subtypes is not set, filter the queryset to show only the subtypes
        else:
            queryset = queryset.exclude(subtype='00')

    # If no filters are provided, return the queryset filtered to show only the significant results
    if not filters:
        return queryset.filter(p__lte=0.05)

    filters = html.unescape(filters)  # Unescape the HTML entities in the filters to handle escapes <, >, etc.

    # If show_subtypes is false, remove the last two digits of the SNP filter
    if not show_subtypes:
        # Match HLA_[letter]_[four digits] and capture only the first two digits
        filters = re.sub(r'(HLA_[A-Z]_\d{2})\d{2}', r'\1', filters)

    # Parse the filters and apply them to the queryset
    filter_list: list = parse_filters(filters)
    combined_query: Q = Q()

    # Loop through the filter list and apply the filters to the queryset
    for logical_operator, filter_str in filter_list:
        if filter_str.startswith('snp'):
            filter_str = normalise_snp_filter(filter_str)
        parts: list = filter_str.split(':', 2)
        if len(parts) < 3:
            continue
        field, operator, value = parts
        value = value.rstrip(',')


        # Apply the filter based on the operator
        if operator == '==':
            q: Q = Q(**{f'{field}__iexact': value})
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

        # Combine the queries based on the logical operator
        if logical_operator == 'AND':
            combined_query &= q
        elif logical_operator == 'OR':
            combined_query |= q

    # Filter the queryset based on the combined query
    queryset = queryset.filter(combined_query)
    # Filter the queryset to show only the significant results
    filtered_queryset: QuerySet = queryset.filter(p__lte=0.05)
    return filtered_queryset


def parse_filters(filters: str) -> list:
    """
    Parse the filters string into a list of tuples.
    :param filters:
    :return:
    """
    # Initialise the filter list and the current operator
    filter_list: list = []
    # Initialise the pattern to match the logical operators
    current_operator = None
    # Initialise the pattern to match the logical operators
    pattern = re.compile(r'\s*(AND|OR)\s*')
    # Split the filters string into parts based on the logical operators
    parts: list = pattern.split(filters)

    # Loop through the parts and add them to the filter list
    for part in parts:
        part = part.strip()
        # If the part is a logical operator, set the current operator
        if part in ('AND', 'OR'):
            current_operator = part
        # If the part is not a logical operator, add it to the filter list
        elif part:
            sub_parts: list = re.findall(r'([^,]+|"[^"]*")+', part)
            for sub_part in sub_parts:
                sub_part = sub_part.strip().strip('"')
                if current_operator:
                    filter_list.append((current_operator, sub_part))
                    current_operator = None
                else:
                    filter_list.append(('AND', sub_part))
    # Return the filter list
    return filter_list


def get_category_data(filters: str, show_subtypes: bool, initial: bool = True) -> tuple:
    """
    Get the category data for the graph.
    :param show_subtypes:
    :param initial:
    :param filters:
    :return:
    """
    # Get the distinct categories from the database
    queryset: QuerySet = HlaPheWasCatalog.objects.values('category_string').distinct()
    # Apply the filters to the queryset
    filtered_queryset: QuerySet = apply_filters(queryset, filters, initial=initial, show_subtypes=show_subtypes)
    # Get the visible nodes
    visible_nodes: list = list(filtered_queryset.values('category_string').distinct())
    # Format the visible nodes
    visible_nodes = ["category-" + node['category_string'].replace(' ', '_') for node in visible_nodes]
    # Order the queryset by the category string
    filtered_queryset = filtered_queryset.order_by('category_string')
    # Format the nodes
    nodes: list = [
        {'id': f"category-{category['category_string'].replace(' ', '_')}", 'label': category['category_string'],
         'node_type': 'category'} for category in filtered_queryset]
    # Format the edges
    edges: list = []
    # Return the nodes, edges, and visible nodes
    return nodes, edges, visible_nodes


def get_disease_data(category_id: str, filters: str, show_subtypes: bool) -> tuple:
    """
    Get the disease data for the selected category.
    :param show_subtypes:
    :param category_id:
    :param filters:
    :return:
    """
    # Get the category string from the category ID
    category_string: str = category_id.replace('category-', '').replace('_', ' ')
    # Get the distinct diseases for the selected category
    queryset: QuerySet = (HlaPheWasCatalog.objects.filter(category_string=category_string)
                          .values('phewas_string', 'category_string').distinct())
    # Apply the filters to the queryset
    filtered_queryset: QuerySet = apply_filters(queryset, filters, show_subtypes=show_subtypes)
    # Get the visible nodes
    filtered_queryset = filtered_queryset.annotate(allele_count=Count('snp'))
    # Get the visible nodes
    visible_nodes: list = list(filtered_queryset.values('phewas_string', 'category_string').distinct())
    # Format the visible nodes
    visible_nodes = ["disease-" + node['phewas_string'].replace(' ', '_') for node in visible_nodes]
    # Order the queryset by the disease string
    filtered_queryset = filtered_queryset.order_by('phewas_string')
    # Format the nodes
    nodes: list = [{'id': f"disease-{disease['phewas_string'].replace(' ', '_')}", 'label': disease['phewas_string'],
                    'node_type': 'disease', 'allele_count': disease['allele_count'],
                    'category': disease['category_string']}
                   for disease in filtered_queryset]
    # Format the edges
    edges: list = [{'source': category_id, 'target': f"disease-{disease['phewas_string'].replace(' ', '_')}"} for
                   disease in
                   filtered_queryset]
    # Return the nodes, edges, and visible nodes
    return nodes, edges, visible_nodes


def get_allele_data(disease_id: str, filters: str, show_subtypes: bool = False) -> tuple:
    """
    Get the allele data for the selected disease.
    :param disease_id:
    :param filters:
    :param show_subtypes: Whether to show the subtypes of the alleles or just the main groups
    :return:
    """
    # Get the disease string from the disease ID
    disease_string: str = disease_id.replace('disease-', '').replace('_', ' ')
    # Get the distinct alleles for the selected disease
    queryset: QuerySet = HlaPheWasCatalog.objects.filter(phewas_string=disease_string).values(
        'snp', 'gene_class', 'gene_name', 'cases', 'controls', 'p', 'odds_ratio', 'l95', 'u95', 'maf'
    ).distinct()
    # Apply the filters to the queryset
    filters = ",".join([f for f in filters.split(',') if 'snp' not in str(f)])
    # Apply the filters to the queryset
    filtered_queryset: QuerySet = apply_filters(queryset, filters, show_subtypes=show_subtypes)
    # Get the visible nodes
    visible_nodes: list = list(filtered_queryset.values('snp', 'phewas_string', 'category_string').distinct())
    visible_nodes = ["allele-" + node['snp'].replace(' ', '_') for node in visible_nodes]
    # Order the queryset by the odds ratio
    filtered_queryset = filtered_queryset.order_by('-odds_ratio')
    nodes: list = [
        {'id': f"allele-{allele['snp'].replace(' ', '_')}", 'label': allele['snp'], 'node_type': 'allele',
         'disease': disease_string, **allele,
         } for allele in filtered_queryset]
    # Format the edges
    edges: list = [{'source': disease_id, 'target': f"allele-{allele['snp'].replace(' ', '_')}"} for allele in
                   filtered_queryset]
    # Return the nodes, edges, and visible nodes
    return nodes, edges, visible_nodes


class InfoView(APIView):
    """
    API view to get the information for a specific allele.

    :param request: Request object from the client with the allele and disease parameters
    :return: Response object with the information for the allele
    """

    def get(self, request) -> Response:
        """
        Get the information for a specific allele.
        :param request: Request object from the client with the allele and disease parameters
        :return: Response object with the information for the allele
        """
        # Get the allele and disease from the request
        allele: str = request.GET.get('allele')
        disease: str = request.GET.get('disease')
        # Get the data for the allele
        allele_data: dict = HlaPheWasCatalog.objects.filter(snp=allele, phewas_string=disease).values(
            'gene_class', 'gene_name', 'serotype', 'subtype', 'phewas_string', 'phewas_code', 'category_string',
            'cases',
            'controls', 'odds_ratio', 'l95', 'u95', 'p', 'maf'
        ).distinct()[0]
        # Remove the subtype if it is the main group
        if allele_data['subtype'] == '00':
            allele_data.pop('subtype')
        # Round p-values to 10 decimal places for consistency and ensure no scientific notation
        allele_data['p'] = round(allele_data['p'], 10)

        # Get the top and lowest odds ratios for the allele
        top_odds: QuerySet = HlaPheWasCatalog.objects.filter(snp=allele, p__lte=0.05).values('phewas_string',
                                                                                             'odds_ratio',
                                                                                             'p').order_by(
            '-odds_ratio')[:5]
        # Get the lowest odds ratios for the allele
        lowest_odds: QuerySet = HlaPheWasCatalog.objects.filter(snp=allele, odds_ratio__gt=0, p__lte=0.05).values(
            'phewas_string',
            'odds_ratio',
            'p').order_by(
            'odds_ratio', 'p')[:5]

        # Round p-values to 10 decimal places for consistency and ensure no scientific notation
        for odds in top_odds:
            odds['p'] = round(odds['p'], 10)
        for odds in lowest_odds:
            odds['p'] = round(odds['p'], 10)

        # Format the data for the response
        allele_data['top_odds'] = list(top_odds)
        allele_data['lowest_odds'] = list(lowest_odds)
        # Return the allele data
        return Response(allele_data)


class ExportDataView(APIView):
    """
    API view to export the data to a CSV file.

    :param request: Request object from the client with the filters parameter
    :return: HttpResponse object with the exported data as a CSV file
    """

    def get(self, request) -> HttpResponse:
        """
        Export the data to a CSV file.

        :param request: Request object from the client with the filters parameter
        :return: HttpResponse object with the exported data as a CSV file
        """
        # Get the filters from the request
        filters: str = request.GET.get('filters', '')
        filters: str = html.unescape(filters)
        # Get the filtered data
        df: pd.DataFrame = get_filtered_df(filters)
        # Create the response object
        response: HttpResponse = HttpResponse(content_type='text/csv')
        # Set the headers for the response
        response['Content-Disposition'] = 'attachment; filename="exported_data.csv"'
        # Set the dataset length header
        response['Dataset-Length'] = str(df.shape[0])
        # Write the data to the response
        buffer: StringIO = StringIO()

        buffer.write(f"Filters: {filters}\n\n")
        # Write the data to the buffer
        df.to_csv(buffer, index=False)
        # Get the CSV content
        csv_content: str = buffer.getvalue()
        response.write(csv_content)
        # Return the response
        return response


def get_filtered_df(filters: str) -> pd.DataFrame:
    """
    Get the filtered data as a DataFrame.
    :param filters: The filters to apply to the data
    :return: df: The filtered data as a DataFrame
    """
    # Get the filtered data
    queryset: QuerySet = HlaPheWasCatalog.objects.all()
    filtered_queryset: QuerySet = apply_filters(queryset, filters, show_subtypes=True, export=True)
    # Get the data as a DataFrame
    df: pd.DataFrame = pd.DataFrame(list(filtered_queryset.values()))
    # Drop the ID column
    if 'id' in df.columns:
        df = df.drop(columns=['id'])
        # Return the filtered DataFrame
    return df


class SendDataToSOMView(APIView):
    """
    API view to send the data to the SOM.

    :param request: Request object from the client with the filters, type, and num_clusters parameters
    :return: JsonResponse object with the status of the request, data ID, number of clusters, and filters
    """

    def get(self, request) -> JsonResponse:
        """
        Get the data from the client and store it in the database.
        :param request: Request object from the client
        :return: JsonResponse object with the status of the request, data ID, number of clusters, and filters
        """
        # Get the filters from the request
        filters: str = request.GET.get('filters', '')
        # Get the type of the SOM
        filters = urllib.parse.unquote(filters)
        # Get the type of the SOM
        som_type: str = request.GET.get('type')
        # Get the number of clusters with a default of 4 if not provided
        num_clusters = int(request.GET.get('num_clusters') or 4)
        # Get the filtered data as a DataFrame
        df: pd.DataFrame = get_filtered_df(filters)
        # Write the data to a buffer
        buffer: StringIO = StringIO()
        df.to_csv(buffer, index=False)
        csv_content: str = buffer.getvalue()
        # Cleanup the old data if necessary
        last_cleanup_time: TemporaryCSVData = TemporaryCSVData.objects.order_by('-created_at').first()
        # If the last cleanup time is not set or more than a day has passed since the last cleanup, cleanup the old data
        if not last_cleanup_time or (timezone.now() - last_cleanup_time.created_at) > timedelta(days=1):
            self.cleanup_old_data()
        # Store the data in the database
        temp_data: TemporaryCSVData = TemporaryCSVData.objects.create(csv_content=csv_content, som_type=som_type)
        # Return the response with the status of the request, data ID, number of clusters, and filters
        return JsonResponse({'status': 'CSV data stored', 'data_id': temp_data.id, 'num_clusters': num_clusters,
                             'filters': filters})

    def cleanup_old_data(self) -> None:
        """
        Cleanup old data from both the database.
        Removes old database records older than 1 day.
        """
        # Set the threshold time to 1 day ago
        threshold_time = timezone.now() - timedelta(days=1)

        # Use a transaction to ensure atomicity
        with transaction.atomic():
            # Filter the old records from the database
            old_records = TemporaryCSVData.objects.filter(created_at__lt=threshold_time)

            # Record the count before deletion for logging
            old_records_count = old_records.count()

            # Delete the old records from the database
            old_records.delete()

        print(f"Deleted {old_records_count} old records from the database.")


class CombinedAssociationsView(APIView):
    """
    API view to get the combined associations for a disease.

    :param request: Request object from the client with the disease and show_subtypes parameters
    :return: Response object with the combined associations for the disease
    """

    def get(self, request) -> Response:
        # Get the disease and show_subtypes parameters from the request
        disease: str = request.GET.get('disease')
        show_subtypes: str = request.GET.get('show_subtypes')
        # Get the allele data for the disease
        allele_data: QuerySet = HlaPheWasCatalog.objects.filter(phewas_string=disease).values(
            'snp', 'gene_name', 'serotype', 'subtype', 'odds_ratio', 'p'
        )
        # Filter the allele data based on the show_subtypes parameter
        if show_subtypes == 'true':
            allele_data = allele_data.exclude(subtype='00')
        else:
            allele_data = allele_data.filter(subtype='00')
        # Get the combinations of alleles and calculate the combined odds ratio and p-value
        allele_combinations: list = list(itertools.combinations(allele_data, 2))
        # Initialise the result list
        result: list = []
        # Loop through the allele combinations and calculate the combined odds ratio and p-value
        for allele1, allele2 in allele_combinations:
            combined_odds_ratio: float = allele1['odds_ratio'] * allele2['odds_ratio']
            if combined_odds_ratio == 0:
                continue
            _, combined_p_value = combine_pvalues([allele1['p'], allele2['p']])
            if combined_p_value >= 0.05:
                continue
            # Append the result to the result list
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
        # Return the response with the combined associations for the disease
        return Response(result)


class GetNodePathView(APIView):
    """
    API view to get the node path from outer level to inner level.

    :param request: Request object from the client with the disease parameter
    :return: Response object with the path from the outer level to the inner level
    """

    def get(self, request) -> Response:
        """
        Get the node path from the outer level to the inner level.
        :param request: Request object from the client with the disease parameter
        :return: Response object with the path from the outer level to the inner level
        """
        # Get the disease parameter from the request or return an error if it is not provided
        disease: str = request.GET.get('disease')
        if not disease:
            return Response({"error": "Disease parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Get the category for the disease and return the path
        try:
            # Get the category for the disease
            category: str = \
                HlaPheWasCatalog.objects.filter(phewas_string=disease).values('category_string').distinct()[0][
                    'category_string']
            category = f"category-{category.replace(' ', '_')}"
            # Format the path
            disease = f"disease-{disease.replace(' ', '_')}"
            path: list = [category, disease]
            # Return the path
            return Response({"path": path})
        # Return an error if the disease is not found
        except IndexError:
            return Response({"error": "Disease not found"}, status=status.HTTP_404_NOT_FOUND)
        # Return an error if an exception occurs
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GetDiseasesForCategoryView(APIView):
    """
    API view to get the diseases for a specific category.

    :param request: Request object from the client with the category parameter
    :return: Response object with the diseases for the category
    """

    def get(self, request) -> Response:

        """
        Get the diseases for a specific category.
        :param request: Request object from the client with the category parameter and optional filters and show_subtypes parameters
        :return: Response object with the diseases for the category
        """
        filters: str = request.GET.get('filters', '')
        category: str = request.GET.get('category')
        show_subtypes = request.GET.get('showSubtypes') == 'true'
        try:
            # Get all objects as a QuerySet initially
            diseases: QuerySet = HlaPheWasCatalog.objects.all()
            # Apply SNP filter first
            filtered_queryset = apply_filters(diseases, filters, show_subtypes=show_subtypes, initial=True)
            # Then filter by category
            category = category.replace('_', ' ') # Replace underscores with spaces to match the category_string
            category_filtered = filtered_queryset.filter(category_string=category)
            # Apply subtype filter last
            if not show_subtypes:
                category_filtered = category_filtered.filter(subtype='00')
            # Get the distinct diseases for the category and sort them as a list
            distinct_diseases = category_filtered.values('phewas_string').distinct()
            diseases: List = sorted([disease['phewas_string'] for disease in distinct_diseases])
            return Response({"diseases": diseases})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
