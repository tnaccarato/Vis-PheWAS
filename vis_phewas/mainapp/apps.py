from django.apps import AppConfig


class MainappConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'mainapp'

    def ready(self):
        def run_build():
            import os
            os.system('npm run build')
            print('Build completed')

        run_build()
