import html
import itertools
import re
import urllib.parse
from datetime import timedelta
from io import StringIO
from typing import List

import pandas as pd
from django.db.models import Q, Count, QuerySet
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
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

    def get(self, request) -> Response:
        return Response({"message": "Welcome to the HLA PheWAS Catalog API"}, status=status.HTTP_200_OK)


class GraphDataView(APIView):
    """
    API view to get the data for the graph.
    """

    def get(self, request) -> Response:
        data_type: str = request.GET.get('type', 'initial')
        filters = request.GET.get('filters')
        show_subtypes =  request.GET.get('show_subtypes')
        if show_subtypes == 'undefined':
            show_subtypes = False
        if filters == ['']:
            filters = []

        if data_type == 'initial':
            nodes, edges, visible = get_category_data(filters, show_subtypes, initial=True)
        elif data_type == 'categories':
            nodes, edges, visible = get_category_data(filters, initial=False, show_subtypes=show_subtypes)
        elif data_type == 'diseases':
            category_id: str = request.GET.get('category_id')
            nodes, edges, visible = get_disease_data(category_id, filters, show_subtypes)
        elif data_type == 'alleles':
            disease_id: str = urllib.parse.unquote(request.GET.get('disease_id'))
            nodes, edges, visible = get_allele_data(disease_id, filters, show_subtypes)
        else:
            return Response({'error': 'Invalid request'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'nodes': nodes, 'edges': edges, 'visible': visible})


def apply_filters(queryset: QuerySet, filters: str, category_id: str = None, show_subtypes: bool = False, export: bool = False, initial: bool = False) -> QuerySet:
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
    if category_id:
        category_string: str = category_id.replace('category-', '').replace('_', ' ')
        queryset = queryset.filter(category_string=category_string)
    if not export and not initial:
        if not show_subtypes:
            queryset = queryset.filter(subtype='00')
        else:
            queryset = queryset.exclude(subtype='00')
    else:
        queryset = queryset

    if not filters:
        return queryset.filter(p__lte=0.05)

    filter_list: list = parse_filters(filters)
    combined_query: Q = Q()

    for logical_operator, filter_str in filter_list:
        parts: list = filter_str.split(':', 2)
        if len(parts) < 3:
            continue
        field, operator, value = parts
        value = value.rstrip(',')

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

        if logical_operator == 'AND':
            combined_query &= q
        elif logical_operator == 'OR':
            combined_query |= q

    queryset = queryset.filter(combined_query)
    filtered_queryset: QuerySet = queryset.filter(p__lte=0.05)
    return filtered_queryset


def parse_filters(filters: str) -> list:
    """
    Parse the filters string into a list of tuples.
    :param filters:
    :return:
    """
    filter_list: list = []
    current_operator = None
    pattern = re.compile(r'\s*(AND|OR)\s*')
    parts: list = pattern.split(filters)

    for part in parts:
        part = part.strip()
        if part in ('AND', 'OR'):
            current_operator = part
        elif part:
            sub_parts: list = re.findall(r'([^,]+|"[^"]*")+', part)
            for sub_part in sub_parts:
                sub_part = sub_part.strip().strip('"')
                if current_operator:
                    filter_list.append((current_operator, sub_part))
                    current_operator = None
                else:
                    filter_list.append(('AND', sub_part))

    return filter_list


def get_category_data(filters: str, show_subtypes: bool, initial: bool = True) -> tuple:
    """
    Get the category data for the graph.
    :param show_subtypes:
    :param initial:
    :param filters:
    :return:
    """
    queryset: QuerySet = HlaPheWasCatalog.objects.values('category_string').distinct()
    filtered_queryset: QuerySet = apply_filters(queryset, filters, initial=initial, show_subtypes=show_subtypes)
    visible_nodes: list = list(filtered_queryset.values('category_string').distinct())
    visible_nodes = ["category-" + node['category_string'].replace(' ', '_') for node in visible_nodes]
    filtered_queryset = filtered_queryset.order_by('category_string')
    nodes: list = [{'id': f"category-{category['category_string'].replace(' ', '_')}", 'label': category['category_string'],
              'node_type': 'category'} for category in filtered_queryset]
    edges: list = []
    return nodes, edges, visible_nodes


def get_disease_data(category_id: str, filters: str, show_subtypes: bool) -> tuple:
    """
    Get the disease data for the selected category.
    :param show_subtypes:
    :param category_id:
    :param filters:
    :return:
    """
    category_string: str = category_id.replace('category-', '').replace('_', ' ')
    queryset: QuerySet = HlaPheWasCatalog.objects.filter(category_string=category_string).values('phewas_string',
                                                                                       'category_string').distinct()
    filtered_queryset: QuerySet = apply_filters(queryset, filters, show_subtypes=show_subtypes)
    filtered_queryset = filtered_queryset.annotate(allele_count=Count('snp'))
    visible_nodes: list = list(filtered_queryset.values('phewas_string', 'category_string').distinct())
    visible_nodes = ["disease-" + node['phewas_string'].replace(' ', '_') for node in visible_nodes]
    filtered_queryset = filtered_queryset.order_by('phewas_string')
    nodes: list = [{'id': f"disease-{disease['phewas_string'].replace(' ', '_')}", 'label': disease['phewas_string'],
              'node_type': 'disease', 'allele_count': disease['allele_count'], 'category': disease['category_string']}
             for disease in filtered_queryset]
    edges: list = [{'source': category_id, 'target': f"disease-{disease['phewas_string'].replace(' ', '_')}"} for disease in
             filtered_queryset]
    return nodes, edges, visible_nodes


def get_allele_data(disease_id: str, filters: str, show_subtypes: bool = False) -> tuple:
    """
    Get the allele data for the selected disease.
    :param disease_id:
    :param filters:
    :param show_subtypes: Whether to show the subtypes of the alleles or just the main groups
    :return:
    """
    disease_string: str = disease_id.replace('disease-', '').replace('_', ' ')
    queryset: QuerySet = HlaPheWasCatalog.objects.filter(phewas_string=disease_string).values(
        'snp', 'gene_class', 'gene_name', 'cases', 'controls', 'p', 'odds_ratio', 'l95', 'u95', 'maf'
    ).distinct()
    filters = ",".join([f for f in filters.split(',') if not ('snp' in str(f))])
    filtered_queryset: QuerySet = apply_filters(queryset, filters, show_subtypes=show_subtypes)
    visible_nodes: list = list(filtered_queryset.values('snp', 'phewas_string', 'category_string').distinct())
    visible_nodes = ["allele-" + node['snp'].replace(' ', '_') for node in visible_nodes]
    filtered_queryset = filtered_queryset.order_by('-odds_ratio')
    nodes: list = [
        {'id': f"allele-{allele['snp'].replace(' ', '_')}", 'label': allele['snp'], 'node_type': 'allele',
         'disease': disease_string, **allele,
         } for allele in filtered_queryset]
    edges: list = [{'source': disease_id, 'target': f"allele-{allele['snp'].replace(' ', '_')}"} for allele in
             filtered_queryset]
    return nodes, edges, visible_nodes


class InfoView(APIView):
    """
    API view to get the information for a specific allele.
    """

    def get(self, request) -> Response:
        allele: str = request.GET.get('allele')
        disease: str = request.GET.get('disease')
        allele_data: dict = HlaPheWasCatalog.objects.filter(snp=allele, phewas_string=disease).values(
            'gene_class', 'gene_name', 'serotype', 'subtype', 'phewas_string', 'phewas_code', 'category_string', 'cases',
            'controls', 'odds_ratio', 'l95', 'u95', 'p', 'maf'
        ).distinct()[0]
        if allele_data['subtype'] == '00':
            allele_data.pop('subtype')

        top_odds: QuerySet = HlaPheWasCatalog.objects.filter(snp=allele, p__lte=0.05).values('phewas_string', 'odds_ratio',
                                                                                   'p').order_by(
            '-odds_ratio')[:5]
        lowest_odds: QuerySet = HlaPheWasCatalog.objects.filter(snp=allele, odds_ratio__gt=0, p__lte=0.05).values('phewas_string',
                                                                                                        'odds_ratio',
                                                                                                        'p').order_by(
            'odds_ratio', 'p')[:5]

        allele_data['top_odds'] = list(top_odds)
        allele_data['lowest_odds'] = list(lowest_odds)
        return Response(allele_data)


class ExportDataView(APIView):
    """
    API view to export the data to a CSV file.
    """

    def get(self, request) -> HttpResponse:
        filters: str = request.GET.get('filters', '')
        df: pd.DataFrame = get_filtered_df(filters)
        response: HttpResponse = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="exported_data.csv"'
        response['Dataset-Length'] = str(df.shape[0])
        buffer: StringIO = StringIO()
        decoded_filters: str = html.unescape(filters)
        buffer.write(f"Filters: {decoded_filters}\n\n")
        df.to_csv(buffer, index=False)
        csv_content: str = buffer.getvalue()
        response.write(csv_content)
        return response


def get_filtered_df(filters: str) -> pd.DataFrame:
    queryset: QuerySet = HlaPheWasCatalog.objects.all()
    filtered_queryset: QuerySet = apply_filters(queryset, filters, show_subtypes=True, export=True)
    df: pd.DataFrame = pd.DataFrame(list(filtered_queryset.values()))
    if 'id' in df.columns:
        df.drop(columns=['id'], inplace=True)
    return df


class SendDataToSOMView(APIView):
    """
    API view to send the data to the SOM.
    """

    def get(self, request) -> JsonResponse:
        filters: str = request.GET.get('filters', '')
        filters = urllib.parse.unquote(filters)
        som_type: str = request.GET.get('type')
        num_clusters: int = int(request.GET.get('num_clusters') or 5 if som_type == 'disease' else 7)
        df: pd.DataFrame = get_filtered_df(filters)
        buffer: StringIO = StringIO()
        df.to_csv(buffer, index=False)
        csv_content: str = buffer.getvalue()
        last_cleanup_time: TemporaryCSVData = TemporaryCSVData.objects.order_by('-created_at').first()
        if not last_cleanup_time or (timezone.now() - last_cleanup_time.created_at) > timedelta(days=1):
            self.cleanup_old_data()
        temp_data: TemporaryCSVData = TemporaryCSVData.objects.create(csv_content=csv_content, som_type=som_type)
        return JsonResponse({'status': 'CSV data stored', 'data_id': temp_data.id, 'num_clusters': num_clusters,
                             'filters': filters})

    def cleanup_old_data(self) -> None:
        threshold: timezone = timezone.now() - timedelta(days=1)
        TemporaryCSVData.objects.filter(created_at__lt=threshold).delete()


class CombinedAssociationsView(APIView):
    """
    API view to get the combined associations for a disease.
    """

    def get(self, request) -> Response:
        disease: str = request.GET.get('disease')
        show_subtypes: str = request.GET.get('show_subtypes')
        allele_data: QuerySet = HlaPheWasCatalog.objects.filter(phewas_string=disease).values(
            'snp', 'gene_name', 'serotype', 'subtype', 'odds_ratio', 'p'
        )
        if show_subtypes == 'true':
            allele_data = allele_data.exclude(subtype='00')
        else:
            allele_data = allele_data.filter(subtype='00')
        allele_combinations: list = list(itertools.combinations(allele_data, 2))
        result: list = []
        for allele1, allele2 in allele_combinations:
            combined_odds_ratio: float = allele1['odds_ratio'] * allele2['odds_ratio']
            if combined_odds_ratio == 0:
                continue
            _, combined_p_value = combine_pvalues([allele1['p'], allele2['p']])
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
        return Response(result)


class GetNodePathView(APIView):
    """
    API view to get the node path from outer level to inner level.
    """

    def get(self, request) -> Response:
        disease: str = request.GET.get('disease')
        if not disease:
            return Response({"error": "Disease parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            category: str = HlaPheWasCatalog.objects.filter(phewas_string=disease).values('category_string').distinct()[0][
                'category_string']
            category = f"category-{category.replace(' ', '_')}"
            disease = f"disease-{disease.replace(' ', '_')}"
            path: list = [category, disease]
            return Response({"path": path})
        except IndexError:
            return Response({"error": "Disease not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GetDiseasesForCategoryView(APIView):
    """
    API view to get the diseases for a specific category.
    """

    def get(self, request) -> Response:
        filters: str = request.GET.get('filters', '')
        category: str = request.GET.get('category')
        if not category:
            return Response({"error": "Category parameter is required"}, status=status.HTTP_400_BAD_REQUEST)
        category = category.replace('_', ' ')
        show_subtypes = request.GET.get('show_subtypes')
        if show_subtypes == 'undefined':
            show_subtypes = False

        try:
            diseases: QuerySet = HlaPheWasCatalog.objects.filter(category_string=category)
            diseases = apply_filters(diseases, filters, show_subtypes=show_subtypes)
            diseases = diseases.values('phewas_string').distinct()
            diseases: List = sorted([disease['phewas_string'] for disease in diseases])
            return Response({"diseases": diseases})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)