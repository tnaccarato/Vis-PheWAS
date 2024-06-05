from django.core.management.base import BaseCommand
import csv
from mainapp.models import HlaPheWasCatalog
from mainapp.cleaning import clean_data

class Command(BaseCommand):
    help = 'Loads data from CSV into the HlaPheWasCatalog model'

    def handle(self, *args, **kwargs):
        clean_data() # Clean the data before loading it into the database
        with open('../Data/hla-phewas-catalog-cleaned.csv', 'r', encoding='utf-8') as file:
            reader = csv.reader(file)
            next(reader)  # Skip the header row
            for row in reader:
                HlaPheWasCatalog.objects.create(
                    phewas_code=row[0],
                    phewas_string=row[1],
                    cases=row[2],
                    controls=row[3],
                    category_string=row[4],
                    odds_ratio=row[5],
                    p=row[6],
                    l95=row[7],
                    u95=row[8],
                    gene_name=row[9],
                    maf=row[10],
                    a1=row[11],
                    a2=row[12],
                    chromosome=row[13],
                    nchrobs=row[14],
                    gene_class=row[15],
                    serotype=row[16],
                    subtype=row[17]
                )
