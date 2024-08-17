import unittest
from unittest.mock import patch, MagicMock, mock_open
import pandas as pd
import numpy as np
from io import StringIO
from .views import preprocess_temp_data, initialise_som, clean_filters, create_title, \
    prepare_categories_for_context
from api.models import TemporaryCSVData
from mainapp.models import HlaPheWasCatalog


class TestSOMFunctions(unittest.TestCase):
    """
    Test the functions in the views.py file of the som app.
    """

    @patch('api.models.TemporaryCSVData')
    def test_preprocess_temp_data(self, MockTemporaryCSVData):
        """
        Test the preprocess_temp_data function.
        :param MockTemporaryCSVData: Mock object for the TemporaryCSVData model
        :return: None
        """
        # Define a mock CSV content string
        mock_csv_content = """snp,p,subtype,odds_ratio,l95,u95,maf,phewas_string,category_string,gene_name
    HLA_1,0.01,1,2.3,1.5,3.5,0.02,Phenotype_A,Category_X,Gene1
    HLA_2,0.04,2,1.9,1.2,2.8,0.03,Phenotype_B,Category_Y,Gene2
    HLA_3,0.10,0,1.5,1.0,2.0,0.05,Phenotype_C,Category_Z,Gene3
    """

        # Make sure the mock object returns the correct CSV content string
        mock_temp_data = MockTemporaryCSVData()
        mock_temp_data.csv_content = mock_csv_content
        # Mock the get method of the TemporaryCSVData model to return the mock object
        MockTemporaryCSVData.objects.get.return_value = mock_temp_data

        # Run the function and assert the result
        result_df = preprocess_temp_data(mock_temp_data)

        # Define the expected data
        expected_data = {
            'snp': ['1', '2'],  # HLA_ prefix should be removed
            'p': [0.01, 0.04],
            'subtype': [1, 2],
            'odds_ratio': [2.3, 1.9],
            'l95': [1.5, 1.2],
            'u95': [3.5, 2.8],
            'maf': [0.02, 0.03],
            'phewas_string': ['Phenotype_A', 'Phenotype_B'],
            'category_string': ['Category_X', 'Category_Y'],
            'gene_name': ['Gene1', 'Gene2']
        }
        # Create a DataFrame from the expected data
        expected_df = pd.DataFrame(expected_data)

        # Check if the function returns the expected DataFrame
        pd.testing.assert_frame_equal(result_df.reset_index(drop=True), expected_df.reset_index(drop=True))

    def test_initialise_som(self):
        """
        Test the initialise_som function.
        :return:
        """
        # Define the normalised input data based on the example in the function
        x_normalised = np.array([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8]])
        # Run the function
        positions, som = initialise_som(x_normalised)

        # Check if the function returns the expected SOM object
        self.assertEqual(len(positions), x_normalised.shape[0])
        self.assertEqual(len(positions[0]), 2)  # SOM positions should have two coordinates (x, y)

    def test_clean_filters(self):
        """
        Test the clean_filters function for both SNP and disease SOM types.
        :return:
        """
        # Define the input filters
        filters = "gene_name:==:Gene1 OR gene_name:==:Gene2 OR gene_name:==:Gene3"
        # Define the SOM type
        som_type = "snp"
        # Define the expected output
        expected_output = "GENE1, GENE2, GENE3"

        # Run the function and assert the result
        cleaned_filters = clean_filters(filters, som_type)
        self.assertEqual(cleaned_filters, expected_output)

        # Define the input filters
        som_type = "disease"
        # Define the expected output
        expected_output = "Gene1, Gene2, Gene3"

        # Run the function and assert the result
        cleaned_filters = clean_filters(filters, som_type)
        # Check if the function returns the expected cleaned filters
        self.assertEqual(cleaned_filters, expected_output)

    def test_create_title_snp(self):
        """
        Test the create_title function for SNP SOM type.
        :return:
        """
        # Define the input data
        filters = "gene_name:==:Gene1 OR gene_name:==:Gene2"
        num_clusters = 3
        vis_type = "snp"
        # Define the expected title
        expected_title = (
            "SOM Clusters of SNPs with Detailed Hover Information<br>"
            "for GENE1, GENE2 and 3 Clusters"
        )

        # Run the function and assert the result
        cleaned_filters, title_text = create_title(filters, num_clusters, vis_type)
        self.assertEqual(title_text, expected_title)

    def test_create_title_disease(self):
        # Define the input data
        filters = "category_string:==:Category X OR category_string:==:Category Y"
        num_clusters = 3
        vis_type = "disease"
        # Define the expected title
        expected_title = (
            "SOM Clusters of Diseases with Detailed Hover Information<br>"
            "for Category X, Category Y and 3 Clusters"
        )

        # Run the function and assert the result
        cleaned_filters, title_text = create_title(filters, num_clusters, vis_type)
        self.assertEqual(title_text, expected_title)

    @patch('mainapp.models.HlaPheWasCatalog.objects')
    def test_prepare_categories_for_context(self, mock_hla_phewas_catalog_objects):
        # Set up the mock for the queryset chain
        mock_query_set = MagicMock() # MagicMock used to mock the QuerySet object
        mock_query_set.distinct.return_value = [
            {"gene_name": "Gene1"},
            {"gene_name": "Gene2"},
            {"gene_name": "GeneA"}
        ]
        # Make sure the mock object returns the correct queryset
        mock_hla_phewas_catalog_objects.values.return_value = mock_query_set

        # Run the function and assert the result
        som_type = "snp"
        categories = prepare_categories_for_context(som_type)
        expected_categories = ["Gene1", "Gene2", "GeneA"]

        # Check if the function returns the expected categories
        self.assertEqual(categories, expected_categories)


if __name__ == '__main__':
    unittest.main()
