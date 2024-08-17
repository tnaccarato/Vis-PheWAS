import unittest
from unittest import TestCase

from django.test import TestCase
from django.urls import reverse
from mainapp.models import HlaPheWasCatalog
from rest_framework import status
from rest_framework.test import APIClient

from api.views import normalise_snp_filter


class HlaPheWasCatalogTestCase(TestCase):

    def setUp(self):
        # Set up the test client and initial test data
        self.client = APIClient()

        # Create test data with an integer for gene_class
        self.category = HlaPheWasCatalog.objects.create(
            category_string='neurological',
            phewas_string='brain cancer',
            phewas_code=1.0,
            snp='HLA_DRB1_0101',
            gene_class=1,  # Use an integer value here
            gene_name='A',
            a1='A',
            a2='P',
            cases=100,
            controls=200,
            p=0.01,
            odds_ratio=2.5,
            l95=1.2,
            u95=3.8,
            maf=0.05,
            serotype='01',
            subtype='01',
            chromosome=6,
            nchrobs=300
        )

    def test_index_view(self):
        url = reverse('index')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['message'], 'Welcome to the HLA PheWAS Catalog API')

    def test_graph_data_view_initial(self):
        url = reverse('graph_data')
        response = self.client.get(url, {'type': 'initial', 'show_subtypes': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('nodes', response.data)
        self.assertIn('edges', response.data)
        self.assertIn('visible', response.data)
        # Check that the nodes contain the expected node (just the category node)
        expected_node = {
            'id': 'category-neurological',
            'label': 'neurological',
            'node_type': 'category'
        }
        self.assertIn(expected_node, response.data['nodes'],
                      f"Expected node '{expected_node}' not found in response nodes: "
                      f"{response.data['nodes']}")
        # Check that the edges are empty
        self.assertFalse(response.data['edges'],
                         f"Expected edges to be empty, but got: {response.data['edges']}")
        # Check that the visible nodes contain the expected node
        self.assertIn(expected_node['id'], response.data['visible'],
                      f"Expected node '{expected_node['id']}' not found in visible nodes: "
                      f"{response.data['visible']}")

    def test_graph_data_view_diseases(self):
        url = reverse('graph_data')
        response = self.client.get(url, {'type': 'diseases', 'category_id': 'category-neurological',
                                         'show_subtypes': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('nodes', response.data)
        self.assertIn('edges', response.data)
        self.assertIn('visible', response.data)
        # Check that the nodes contain the expected node
        expected_node = {
            'id': 'disease-brain_cancer',
            'label': 'brain cancer',
            'node_type': 'disease',
            'allele_count': 1,
            'category': 'neurological',
        }
        self.assertIn(expected_node, response.data['nodes'],
                      f"Expected node '{expected_node}' not found in response nodes: "
                      f"{response.data['nodes']}")
        # Check that the edges contain the expected edge
        expected_edge = {
            'source': 'category-neurological',
            'target': 'disease-brain_cancer'
        }
        self.assertIn(expected_edge, response.data['edges'],
                      f"Expected edge '{expected_edge}' not found in response edges: "
                      f"{response.data['edges']}")
        # Check that the visible nodes contain the expected node
        self.assertIn(expected_node['id'], response.data['visible'],
                      f"Expected node '{expected_node['id']}' not found in visible nodes: "
                      f"{response.data['visible']}")

    def test_graph_data_view_alleles(self):
        url = reverse('graph_data')
        response = self.client.get(url, {
            'type': 'alleles',
            'disease_id': 'disease-brain_cancer',
            'filters': '',
            'clicked': 'true',
            'show_subtypes': 'true'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('nodes', response.data)
        self.assertIn('edges', response.data)
        self.assertIn('visible', response.data)

        # Print the actual response data for debugging
        print("Response data:", response.data)

        # Check that the nodes contain the expected node
        expected_node = {
            'id': 'allele-HLA_DRB1_0101',
            'label': 'HLA_DRB1_0101',
            'node_type': 'allele',
            'disease': 'brain cancer',
            'snp': 'HLA_DRB1_0101',
            'gene_class': 1,
            'gene_name': 'A',
            'cases': 100,
            'controls': 200,
            'p': 0.01,
            'odds_ratio': 2.5,
            'l95': 1.2,
            'u95': 3.8,
            'maf': 0.05
        }

        self.assertIn(expected_node, response.data['nodes'],
                      f"Expected node '{expected_node}' not found in response nodes: "
                      f"{response.data['nodes']}")
        # Check that the edges contain the expected edge
        expected_edge = {
            'source': 'disease-brain_cancer',
            'target': 'allele-HLA_DRB1_0101'
        }
        self.assertIn(expected_edge, response.data['edges'],
                      f"Expected edge '{expected_edge}' not found in response edges: "
                      f"{response.data['edges']}")
        # Check that the visible nodes contain the expected node
        self.assertIn(expected_node['id'], response.data['visible'],
                      f"Expected node '{expected_node['id']}' not found in visible nodes: "
                      f"{response.data['visible']}")

    def test_info_view(self):
        url = reverse('info')
        response = self.client.get(url, {'allele': 'HLA_DRB1_0101', 'disease': 'brain cancer'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('gene_class', response.data)
        self.assertIn('top_odds', response.data)
        self.assertIn('lowest_odds', response.data)

    def test_export_data_view(self):
        url = reverse('export_data')
        response = self.client.get(url, {'filters': ''})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['content-type'], 'text/csv')
        self.assertIn('Dataset-Length', response)
        # Get the content of the response
        content = response.content.decode('utf-8')
        # Split content into lines
        lines = content.splitlines()
        # Expected first line to describe the filters
        expected_filter_line = 'Filters: '
        self.assertEqual(lines[0], expected_filter_line,
                         f"Expected first line to be the filter description, but got: {lines[0]}")
        # Next line should show the column headers
        expected_header_line = ('snp,phewas_code,phewas_string,cases,controls,category_string,odds_ratio,p,l95,u95,'
                                'gene_name,maf,a1,a2,chromosome,nchrobs,gene_class,serotype,subtype')
        self.assertEqual(lines[2], expected_header_line,
                         f"Expected second line to be the column headers, but got: {lines[1]}")
        # And finally the data
        expected_data_line = ('HLA_DRB1_0101,1.0,brain cancer,100,200,neurological,2.5,0.01,1.2,3.8,A,0.05,A,P,6,300,'
                              '1,01,01')
        self.assertEqual(lines[3], expected_data_line,
                         f"Expected third line to be the data, but got: {lines[2]}")

    def test_export_data_view_with_filters(self):
        url = reverse('export_data')
        response = self.client.get(url, {'filters': 'gene_class=1'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['content-type'], 'text/csv')
        self.assertIn('Dataset-Length', response)
        # Get the content of the response
        content = response.content.decode('utf-8')
        # Split content into lines
        lines = content.splitlines()
        # Expected first line to describe the filters
        expected_filter_line = 'Filters: gene_class=1'

        self.assertEqual(lines[0], expected_filter_line,
                         f"Expected first line to be the filter description, but got: {lines[0]}")
        # Next line should show the column headers
        expected_header_line = ('snp,phewas_code,phewas_string,cases,controls,category_string,odds_ratio,p,l95,u95,'
                                'gene_name,maf,a1,a2,chromosome,nchrobs,gene_class,serotype,subtype')
        self.assertEqual(lines[2], expected_header_line,
                         f"Expected second line to be the column headers, but got: {lines[1]}")
        # And finally the data
        expected_data_line = ('HLA_DRB1_0101,1.0,brain cancer,100,200,neurological,2.5,0.01,1.2,3.8,A,0.05,A,P,6,300,'
                              '1,01,01')
        self.assertEqual(lines[3], expected_data_line,
                         f"Expected third line to be the data, but got: {lines[2]}")

    def test_export_data_view_with_empty_dataset(self):
        url = reverse('export_data')

        # Using a filter that should exclude all records
        response = self.client.get(url, {'filters': 'p:>=:1'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['content-type'], 'text/csv')

        # Decode the content of the response
        content = response.content.decode('utf-8')

        # Split content into lines
        lines = content.splitlines()

        # Expected first line to describe the filters
        expected_filter_line = 'Filters: p:>=:1'
        self.assertEqual(lines[0], expected_filter_line,
                         f"Expected first line to be the filter description, but got: {lines[0]}")

        # The next three lines should be blank
        self.assertEqual(lines[1], '', "Expected a blank line after the filter description")
        self.assertEqual(lines[2], '', "Expected a second blank line after the filter description")

        # Ensure there are no additional lines
        self.assertEqual(len(lines), 3,
                         f"Expected 3 lines in total (filter description and 3 blanks), but got {len(lines)}")

    def test_combined_associations_view(self):
        url = reverse('combined_associations')
        response = self.client.get(url, {'disease': 'Disease 1', 'show_subtypes': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_get_node_path_view(self):
        url = reverse('get_path_to_node')
        response = self.client.get(url, {'disease': 'brain cancer'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('path', response.data)
        # Check that the path is a list
        self.assertIsInstance(response.data['path'], list)
        # Check that the path is not empty
        self.assertTrue(response.data['path'])
        # Check that the path contains the expected nodes
        expected_nodes = ['neurological', 'brain cancer']

    def test_get_diseases_for_category_view(self):
        url = reverse('get_diseases_for_category')
        response = self.client.get(url, {'category': 'neurological', 'show_subtypes': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('diseases', response.data)
        # Check that the diseases are a list
        self.assertIsInstance(response.data['diseases'], list)
        # Check that the diseases are not empty
        self.assertTrue(response.data['diseases'])
        # Check that the diseases contain the expected disease
        expected_diseases = ['brain cancer']
        self.assertEqual(response.data['diseases'], expected_diseases)


if __name__ == '__main__':
    unittest.main()


class NormaliseSNPFilterTests(TestCase):
    """
    Tests for the normalise_snp_filter function
    """
    def test_normalise_snp_filter_should_equalHLA_A_01(self):
        """
        Test that the normalise_snp_filter function normalises the SNP filter to the expected format
        :return:
        """
        # Test cases
        test_cases = [
            "snp:==:a 01",
            "snp:==:hla_a_01",
            "snp:==:HLA-A01",
            "snp_HLA A01",
            "snp:==:a-01"
        ]

        # Loop through the test cases
        for test_case in test_cases:
            with self.subTest(test_case=test_case):
                self.assertEqual(normalise_snp_filter(test_case), "snp:==:HLA_A_01") # Expected result

