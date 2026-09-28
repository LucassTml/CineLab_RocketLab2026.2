from fastapi import APIRouter

from app.api.v1 import auth, catalog, movies, stats

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(movies.router)
api_router.include_router(catalog.router)
api_router.include_router(stats.router)
