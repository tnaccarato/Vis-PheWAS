import os
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import numpy as np
import pandas as pd
from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from scipy.sparse import csr_matrix
from sklearn.preprocessing import OneHotEncoder, MinMaxScaler

from api.models import TemporaryCSVData
from som.som_utils import preprocess_temp_data, initialise_som, clean_filters, \
    prepare_categories_for_context, create_title, cluster_results_to_csv, clean_up_old_files, get_file_timestamp, \
    compute_mean_som_results, evaluate_som, compute_combined_score
from som.views import SOMView


class TestSOMFunctions(TestCase):
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

        # Mock the TemporaryCSVData object to return the mock CSV content
        mock_temp_data = MockTemporaryCSVData()
        mock_temp_data.csv_content = mock_csv_content
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
        expected_df = pd.DataFrame(expected_data)

        # Check if the function returns the expected DataFrame
        pd.testing.assert_frame_equal(result_df.reset_index(drop=True), expected_df.reset_index(drop=True))

    def test_initialise_som(self):
        """
        Test the initialise_som function.
        :return: None
        """
        # Define normalized input data
        x_normalised = np.array([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8]])
        # Run the function
        positions, som = initialise_som(x_normalised)

        # Validate that the positions and SOM object are correct
        self.assertEqual(len(positions), x_normalised.shape[0])
        self.assertEqual(len(positions[0]), 2)  # SOM positions should have two coordinates (x, y)

    def test_clean_filters(self):
        """
        Test the clean_filters function for both SNP and disease SOM types.
        :return: None
        """
        # Test SNP type
        filters = "gene_name:==:Gene1 OR gene_name:==:Gene2 OR gene_name:==:Gene3"
        som_type = "snp"
        expected_output = "GENE1, GENE2, GENE3"
        cleaned_filters = clean_filters(filters, som_type)
        self.assertEqual(cleaned_filters, expected_output)

        # Test Disease type
        som_type = "disease"
        expected_output = "Gene1, Gene2, Gene3"
        cleaned_filters = clean_filters(filters, som_type)
        self.assertEqual(cleaned_filters, expected_output)

    def test_create_title_snp(self):
        """
        Test the create_title function for SNP SOM type.
        :return: None
        """
        filters = "gene_name:==:Gene1 OR gene_name:==:Gene2"
        num_clusters = 3
        vis_type = "snp"
        expected_title = (
            "SOM Clusters of SNPs with Detailed Hover Information<br>"
            "for GENE1, GENE2 and 3 Clusters"
        )

        cleaned_filters, title_text = create_title(filters, num_clusters, vis_type)
        self.assertEqual(title_text, expected_title)

    def test_create_title_disease(self):
        """
        Test the create_title function for Disease SOM type.
        :return: None
        """
        filters = "category_string:==:Category X OR category_string:==:Category Y"
        num_clusters = 3
        vis_type = "disease"
        expected_title = (
            "SOM Clusters of Diseases with Detailed Hover Information<br>"
            "for Category X, Category Y and 3 Clusters"
        )

        cleaned_filters, title_text = create_title(filters, num_clusters, vis_type)
        self.assertEqual(title_text, expected_title)

    @patch('mainapp.models.HlaPheWasCatalog.objects')
    def test_prepare_categories_for_context(self, mock_hla_phewas_catalog_objects):
        """
        Test the prepare_categories_for_context function for SNP SOM type.
        :param mock_hla_phewas_catalog_objects: Mock object for HlaPheWasCatalog queryset
        :return: None
        """
        mock_query_set = MagicMock()
        mock_query_set.distinct.return_value = [
            {"gene_name": "Gene1"},
            {"gene_name": "Gene2"},
            {"gene_name": "GeneA"}
        ]
        mock_hla_phewas_catalog_objects.values.return_value = mock_query_set

        som_type = "snp"
        categories = prepare_categories_for_context(som_type)
        expected_categories = ["Gene1", "Gene2", "GeneA"]

        self.assertEqual(categories, expected_categories)

    @patch('mainapp.models.HlaPheWasCatalog.objects')  # Patch the objects manager of HlaPheWasCatalog
    def test_prepare_categories_for_context_disease(self, mock_objects):
        """
        Test the prepare_categories_for_context function for Disease SOM type.
        :return: None
        """
        # Set up the mock for the queryset chain
        mock_query_set = MagicMock()
        mock_query_set.distinct.return_value = [
            {"category_string": "Category X"},
            {"category_string": "Category Y"},
            {"category_string": "Category Z"}
        ]
        mock_objects.values.return_value = mock_query_set

        # Call the function with 'disease' type
        som_type = "disease"
        categories = prepare_categories_for_context(som_type)

        # Define the expected categories
        expected_categories = ["Category X", "Category Y", "Category Z"]

        # Assert the function returns the expected categories
        self.assertEqual(categories, expected_categories)

    def test_prepare_categories_for_context_invalid(self):
        """
        Test the prepare_categories_for_context function with an invalid SOM type.
        :return: None
        """
        som_type = "invalid"
        try:
            prepare_categories_for_context(som_type)
        except ValueError as e:
            self.assertEqual(str(e), "Invalid SOM type. Please provide a valid type ('snp' or 'disease').")

    def test_prepare_categories_for_context_empty(self):
        """
        Test the prepare_categories_for_context function with an empty SOM type.
        :return: None
        """
        som_type = ""
        try:
            prepare_categories_for_context(som_type)
        except ValueError as e:
            self.assertEqual(str(e), "Invalid SOM type. Please provide a valid type ('snp' or 'disease').")

    def test_prepare_categories_for_context_none(self):
        """
        Test the prepare_categories_for_context function with None as the SOM type.
        :return: None
        """
        som_type = None
        try:
            prepare_categories_for_context(som_type)
        except ValueError as e:
            self.assertEqual(str(e), "Invalid SOM type. Please provide a valid type ('snp' or 'disease').")

    @patch('som.som_utils.clean_up_old_files')
    @patch('som.som_utils.pd.DataFrame.to_csv')
    def test_cluster_results_to_csv(self, mock_to_csv, mock_clean_up):
        # Create a mock DataFrame
        mock_df = pd.DataFrame({'col1': [1, 2], 'col2': [3, 4]})

        # Run the function
        file_name = cluster_results_to_csv(mock_df)

        # Check that the cleanup function was called
        mock_clean_up.assert_called_once()

        # Check that the CSV was saved with the correct filename
        mock_to_csv.assert_called_once_with(os.path.join(settings.MEDIA_ROOT, file_name), index=False)
        self.assertTrue(file_name.startswith("cluster_results_") and file_name.endswith(".csv"))

    @patch('som.som_utils.os.remove')
    @patch('som.som_utils.glob.glob')
    @patch('som.som_utils.get_file_timestamp')
    def test_clean_up_old_files(self, mock_get_file_timestamp, mock_glob, mock_remove):
        # Mock files and their timestamps
        mock_glob.return_value = ['file1.csv', 'file2.csv']

        # Define a function to simulate the side effect
        def side_effect(file_path):
            if file_path == 'file1.csv':
                return datetime.now() - timedelta(days=2)  # 2 days old
            elif file_path == 'file2.csv':
                return datetime.now() - timedelta(hours=12)  # 12 hours old

        # Set the side effect function
        mock_get_file_timestamp.side_effect = side_effect

        # Run the function
        clean_up_old_files()

        # Verify that only the old file is removed
        mock_remove.assert_called_once_with('file1.csv')

    def test_get_file_timestamp_valid(self):
        # Valid file name
        file_path = "cluster_results_20230830_123456.csv"
        expected_timestamp = datetime.strptime("20230830_123456", "%Y%m%d_%H%M%S")

        # Assert the function returns the correct timestamp
        self.assertEqual(get_file_timestamp(file_path), expected_timestamp)

    def test_get_file_timestamp_invalid(self):
        # Invalid file name
        file_path = "invalid_file_name.csv"

        # Assert that the function returns a very recent time
        self.assertGreaterEqual(get_file_timestamp(file_path), datetime.now() - timedelta(seconds=1))

    def test_clean_filters_empty(self):
        # Test with empty filter
        result = clean_filters("", 'snp')
        self.assertEqual(result, "All Genes")

        result = clean_filters("", 'disease')
        self.assertEqual(result, "All Categories")

    @patch('mainapp.models.HlaPheWasCatalog.objects')
    def test_clean_filters_all_genes(self, mock_objects):
        # Mock distinct count to return the full count
        mock_objects.values.return_value.distinct.return_value.count.return_value = 3

        filters = "gene_name:==:Gene1 OR gene_name:==:Gene2 OR gene_name:==:Gene3"
        result = clean_filters(filters, 'snp')
        self.assertEqual(result, "All Genes")

    def test_create_title(self):
        filters = "gene_name:==:Gene1 OR gene_name:==:Gene2"
        num_clusters = 3
        vis_type = "snp"

        cleaned_filters, title_text = create_title(filters, num_clusters, vis_type)
        expected_title = "SOM Clusters of SNPs with Detailed Hover Information<br>for GENE1, GENE2 and 3 Clusters"

        self.assertEqual(title_text, expected_title)


    @patch('glob.glob')
    @patch('som.views.pd.read_csv')
    @patch('som.views.pd.DataFrame.to_csv')
    def test_compute_mean_som_results_with_files(self, mock_to_csv, mock_read_csv, mock_glob):
        """
        Test compute_mean_som_results when CSV files are present.
        """
        # Mock the return value of glob to simulate existing files
        mock_glob.return_value = ['som_evaluation_results_snp_1.csv', 'som_evaluation_results_snp_2.csv']

        # Mock the DataFrame returned by read_csv for each file
        df1 = pd.DataFrame({'Quantization Error': [0.1, 0.2], 'Topographic Error': [0.3, 0.4]})
        df2 = pd.DataFrame({'Quantization Error': [0.2, 0.3], 'Topographic Error': [0.4, 0.5]})
        mock_read_csv.side_effect = [df1, df2]

        # Call the function under test
        mean_results = compute_mean_som_results(['snp'])

        # Verify that the correct number of CSV files were read
        mock_read_csv.assert_any_call('som_evaluation_results_snp_1.csv')
        mock_read_csv.assert_any_call('som_evaluation_results_snp_2.csv')

        # Verify that the concatenated DataFrame and the mean computation were correct
        expected_mean_df = pd.DataFrame({'Quantization Error': [0.2], 'Topographic Error': [0.4]})
        pd.testing.assert_frame_equal(mean_results['snp'], expected_mean_df)

        # Verify that to_csv was called to save the result
        mock_to_csv.assert_called_once_with('som_evaluation_results_snp_mean.csv', index=False)


    @patch('glob.glob')
    @patch('som.views.pd.read_csv')
    def test_compute_mean_som_results_no_files(self, mock_read_csv, mock_glob):
        """
        Test compute_mean_som_results when no CSV files are present.
        """
        # Mock the return value of glob to simulate no files found
        mock_glob.return_value = []

        # Call the function under test
        mean_results = compute_mean_som_results(['snp'])

        # Verify that no CSV files were read
        mock_read_csv.assert_not_called()

        # Verify that mean_results is empty
        self.assertEqual(mean_results, {})


    @patch('glob.glob')
    @patch('som.views.pd.read_csv')
    @patch('som.views.pd.DataFrame.to_csv')
    def test_compute_mean_som_results_multiple_som_types(self, mock_to_csv, mock_read_csv, mock_glob):
        """
        Test compute_mean_som_results for multiple SOM types.
        """
        # Mock the return value of glob to simulate files for both types
        mock_glob.side_effect = [
            ['som_evaluation_results_snp_1.csv', 'som_evaluation_results_snp_2.csv'],
            ['som_evaluation_results_disease_1.csv']
        ]

        # Mock the DataFrame returned by read_csv for each file
        df_snp1 = pd.DataFrame({'Quantization Error': [0.1, 0.2], 'Topographic Error': [0.3, 0.4]})
        df_snp2 = pd.DataFrame({'Quantization Error': [0.2, 0.3], 'Topographic Error': [0.4, 0.5]})
        df_disease = pd.DataFrame({'Quantization Error': [0.15, 0.25], 'Topographic Error': [0.35, 0.45]})
        mock_read_csv.side_effect = [df_snp1, df_snp2, df_disease]

        # Call the function under test
        mean_results = compute_mean_som_results(['snp', 'disease'])

        # Verify that the correct number of CSV files were read
        mock_read_csv.assert_any_call('som_evaluation_results_snp_1.csv')
        mock_read_csv.assert_any_call('som_evaluation_results_snp_2.csv')
        mock_read_csv.assert_any_call('som_evaluation_results_disease_1.csv')

        # Verify that the concatenated DataFrame and the mean computation were correct
        expected_mean_snp_df = pd.DataFrame({'Quantization Error': [0.2], 'Topographic Error': [0.4]})
        expected_mean_disease_df = pd.DataFrame({'Quantization Error': [0.2], 'Topographic Error': [0.4]})

        pd.testing.assert_frame_equal(mean_results['snp'], expected_mean_snp_df)
        pd.testing.assert_frame_equal(mean_results['disease'], expected_mean_disease_df)

        # Verify that to_csv was called to save the results
        mock_to_csv.assert_any_call('som_evaluation_results_snp_mean.csv', index=False)
        mock_to_csv.assert_any_call('som_evaluation_results_disease_mean.csv', index=False)

    def test_compute_combined_score(self):
        # Test with normal input values
        qe = [0.1, 0.3, 0.5, 0.7]
        te = [0.2, 0.4, 0.6, 0.8]
        result = compute_combined_score(qe, te)

        # Normalising manually
        scaler = MinMaxScaler()
        normalised_qe = scaler.fit_transform(np.array(qe).reshape(-1, 1)).flatten()
        normalised_te = scaler.fit_transform(np.array(te).reshape(-1, 1)).flatten()
        expected = normalised_qe + normalised_te

        # Check if the result matches the expected output
        np.testing.assert_array_almost_equal(result, expected)

class SOMViewTestCase(TestCase):
    """
    Test cases for the SOMView class.
    """

    def setUp(self):
        # Set up the test client
        self.client = APIClient()

        # Create a TemporaryCSVData object for testing
        self.temp_data = TemporaryCSVData.objects.create(
            csv_content="""snp,p,subtype,odds_ratio,l95,u95,maf,phewas_string,category_string,gene_name
            HLA_1,0.01,1,2.3,1.5,3.5,0.02,Phenotype_A,Category_X,Gene1
            HLA_2,0.04,2,1.9,1.2,2.8,0.03,Phenotype_B,Category_Y,Gene2
            HLA_3,0.10,0,1.5,1.0,2.0,0.05,Phenotype_C,Category_Z,Gene3
            """
        )

    @patch('som.views.SOMView.process_and_visualise_som')
    def test_get(self, mock_process_and_visualise_som):
        """
        Test the GET method of SOMView.
        """
        # Mock the return value of process_and_visualise_som
        mock_process_and_visualise_som.return_value = {'some_key': 'some_value'}

        # Make a GET request to the view
        response = self.client.get(reverse('SOM'), {'data_id': self.temp_data.id, 'type': 'snp'})

        # Check that the view calls process_and_visualise_som with correct parameters
        mock_process_and_visualise_som.assert_called_with(str(self.temp_data.id), 4, None, 'snp', testing=False)

        # Check that the response has a 200 status code
        self.assertEqual(response.status_code, 200)

    @patch('som.views.cluster_results_to_csv')
    @patch('som.views.initialise_som')
    @patch('som.views.preprocess_temp_data')
    @patch('som.views.SOMView.perform_dimensionality_reduction')
    def test_process_and_visualise_som(self, mock_dimensionality_reduction, mock_preprocess, mock_initialise_som,
                                       mock_cluster_results_to_csv):
        """
        Test the process_and_visualise_som method.
        """
        # Mock the return value of preprocess_temp_data to be a DataFrame with at least 4 samples
        mock_preprocess.return_value = pd.DataFrame({
            'snp': ['HLA_1', 'HLA_2', 'HLA_3', 'HLA_4'],
            'phewas_string': ['Phenotype_A', 'Phenotype_B', 'Phenotype_C', 'Phenotype_D'],
            'p': [0.01, 0.04, 0.02, 0.03],
            'odds_ratio': [2.3, 1.9, 2.0, 1.7],
            'category_string': ['Category_X', 'Category_Y', 'Category_X', 'Category_Y'],
            'l95': [1.5, 1.2, 1.4, 1.1],
            'u95': [3.5, 2.8, 3.0, 2.9],
            'maf': [0.02, 0.03, 0.04, 0.01],
            'cases': [100, 200, 150, 180],
            'controls': [200, 300, 250, 220]
        })

        # Mock the return value for initialise_som
        mock_som_instance = MagicMock()
        mock_som_instance.distance_map.return_value = np.array([[0.1, 0.2], [0.2, 0.1]])  # Mock the distance map output
        mock_initialise_som.return_value = (np.array([[0, 1], [1, 0], [1, 1], [0, 0]]), mock_som_instance)

        # Mock the return value for cluster_results_to_csv
        mock_cluster_results_to_csv.return_value = 'test_file.csv'

        # Mock the return value for perform_dimensionality_reduction
        mock_dimensionality_reduction.return_value = np.array([[0, 1], [1, 0], [1, 1], [0, 0]])

        # Create an instance of SOMView
        som_view = SOMView()

        # Call process_and_visualise_som method
        context = som_view.process_and_visualise_som(self.temp_data.id, 4, None, 'snp', testing=False)

        # Check that the cluster results CSV file is set correctly
        self.assertIn('csv_path', context)
        self.assertEqual(context['csv_path'], '/media/test_file.csv')

    def test_perform_dimensionality_reduction(self):
        """
        Test the perform_dimensionality_reduction method when there are more than 100 features.
        """
        # Create an instance of SOMView
        som_view = SOMView()

        # Create a mock features matrix with more than 100 columns and more than 100 rows
        mock_features_matrix = np.random.rand(200, 150)  # 200 rows, 150 columns

        # Call the perform_dimensionality_reduction method
        reduced_features_matrix = som_view.perform_dimensionality_reduction(mock_features_matrix)

        # Print the shape of the input and output matrices for debugging
        print(f"Input features matrix shape: {mock_features_matrix.shape}")
        print(f"Reduced features matrix shape: {reduced_features_matrix.shape}")

        # Ensure the result is a numpy array
        self.assertTrue(isinstance(reduced_features_matrix, np.ndarray))

        # Check if the reduction happened correctly (should be reduced to 100 components due to min(100, 150-1))
        self.assertEqual(reduced_features_matrix.shape, (200, 100))

    def test_engineer_features(self):
        """
        Test the engineer_features method.
        """
        # Create an instance of SOMView
        som_view = SOMView()

        # Create a mock filtered DataFrame
        mock_filtered_df = pd.DataFrame({
            'snp': ['HLA_1', 'HLA_2', 'HLA_3'],
            'phewas_string': ['Phenotype_A', 'Phenotype_B', 'Phenotype_C'],
            'p': [0.01, 0.04, 0.10],
            'odds_ratio': [2.3, 1.9, 1.5],
            'category_string': ['Category_X', 'Category_Y', 'Category_Z'],
            'l95': [1.5, 1.2, 1.0],
            'u95': [3.5, 2.8, 2.0],
            'maf': [0.02, 0.03, 0.05],
            'cases': [100, 200, 300],
            'controls': [200, 300, 400]
        })

        # Mock the OneHotEncoder methods
        mock_ohe = OneHotEncoder(sparse_output=True)
        phenotype_encoded = mock_ohe.fit_transform(mock_filtered_df[['phewas_string']])
        category_encoded = mock_ohe.fit_transform(mock_filtered_df[['category_string']])

        # Ensure the engineer_features function processes correctly
        features_matrix, grouped_df = som_view.engineer_features(mock_filtered_df, 'snp')

        # Check that the function creates the correct sparse matrix
        self.assertTrue(isinstance(features_matrix, csr_matrix))
        self.assertEqual(features_matrix.shape[0], len(mock_filtered_df))

    def test_construct_results_df(self):
        """
        Test the construct_results_df method.
        """
        # Create an instance of SOMView
        som_view = SOMView()

        # Create mock grouped DataFrame and positions DataFrame
        mock_grouped_df = pd.DataFrame({
            'snp': ['HLA_1', 'HLA_2'],
            'phewas_string': ['Phenotype_A', 'Phenotype_B'],
            'p': [0.01, 0.04],
            'odds_ratio': [2.3, 1.9],
            'category_string': ['Category_X', 'Category_Y'],
        })
        mock_positions_df = pd.DataFrame({'x': [0, 1], 'y': [1, 0]})

        # Call the construct_results_df method
        results_df = som_view.construct_results_df(mock_grouped_df, mock_positions_df, 'snp')

        # Check the structure of the returned DataFrame
        self.assertIn('x', results_df.columns)
        self.assertIn('y', results_df.columns)
        self.assertIn('snp', results_df.columns)
        self.assertIn('phenotypes', results_df.columns)


if __name__ == '__main__':
    from django.core.management import execute_from_command_line
    import sys

    # Run the Django test runner
    execute_from_command_line([sys.argv[0], 'test'])
