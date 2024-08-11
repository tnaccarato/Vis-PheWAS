from django.apps import AppConfig
from django.conf import settings


class MainappConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'mainapp'

    def ready(self):
        def run_build():
            import os
            os.system('npm run build')
            print('Build completed')

        # Only run build if not testing
        if not settings.TESTING:
            run_build()