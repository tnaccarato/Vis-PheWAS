import numpy as np
import pandas as pd

HLA_PHEWAS_CATALOG_CSV = '../../Data/hla-phewas-catalog.csv'


def clean_data() -> None:
    """
    This function cleans the data by imputing missing values and extracts the serotype and subtype from the snp column
    and saves the changes to the csv file
    :return:
    """
    # Load the data
    data = pd.read_csv('%s' % HLA_PHEWAS_CATALOG_CSV)

    impute_missing_categories(data)

    add_data_cols(data)

    # Save the cleaned data to a csv file
    data.to_csv(HLA_PHEWAS_CATALOG_CSV, index=False)


def impute_missing_categories(data) -> None:
    """
    This function imputes missing values in the category_string column with 'infectious diseases'
    :param data:
    :return:
    """
    # Impute the missing values with infectious diseases as is closest to the missing values
    data['category_string'] = data['category_string'].fillna('infectious diseases')
    # Print a statement to indicate the completion of the cleaning process
    print('Missing values imputed successfully')


def add_data_cols(data) -> None:
    """
    This function adds a new column to the data to indicate the class based on the gene name and extracts the serotype
    and subtype from the snp column
    :param data:
    :return:
    """
    # Add a new column to the data to indicate the class based on the gene name
    data['gene_class'] = np.where(data['gene_name'].isin(['A', 'B', 'C']), 1, 2)
    data.to_csv(HLA_PHEWAS_CATALOG_CSV, index=False)
    # Print a statement to indicate the completion of the cleaning process
    print('Gene class added successfully')
    # Defines a regex pattern to extract the serotype and subtype from the snp column
    pattern = r'HLA_([A-Z0-9]+)_(\d{2})(\d{2})?$'
    # Extract the serotype and subtype from the snp column
    data[['name', 'serotype', 'subtype']] = data['snp'].str.extract(pattern)
    # Drop the snp column and redundant name column
    cleaned_data = data.drop(['snp', 'name'], axis=1)
    # Fill missing values in subtype column with '00' as an indicator of no deeper specificity
    cleaned_data['subtype'] = cleaned_data['subtype'].fillna('00')
    # Print a statement to indicate the completion of the cleaning process
    print('Serotype and subtype extracted successfully')


clean_data()
