import sys
import os
from a2wsgi import ASGIMiddleware
from main import app

# Adaptar FastAPI (ASGI) para que funcione en cPanel (WSGI)
application = ASGIMiddleware(app)