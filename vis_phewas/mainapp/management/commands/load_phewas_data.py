from django.core.management.base import BaseCommand
import csv
from mainapp.models import HlaPheWasCatalog

class Command(BaseCommand):
    help = 'Loads data from CSV into the HlaPheWasCatalog model'

    def handle(self, *args, **kwargs):
        with open('../Data/hla-phewas-catalog.csv', 'r', encoding='utf-8') as file:
            reader = csv.reader(file)
            next(reader)  # Skip the header row
            for row in reader:
                HlaPheWasCatalog.objects.create(
                    snp=row[0],
                    phewas_code=row[1],
                    phewas_string=row[2],
                    cases=row[3],
                    controls=row[4],
                    category_string=row[5],
                    odds_ratio=row[6],
                    p=row[7],
                    l95=row[8],
                    u95=row[9],
                    gene_name=row[10],
                    maf=row[11],
                    a1=row[12],
                    a2=row[13],
                    chromosome=row[14],
                    nchrobs=row[15],
                    gene_class=row[16],
                    serotype=row[17],
                    subtype=row[18]
                )
