import pytest
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True

    with app.test_client() as test_client:
        yield test_client


def test_home_page(client):
    response = client.get("/")
    assert response.status_code == 200


def test_dashboard_page(client):
    response = client.get("/dashboard")
    assert response.status_code == 200


def test_state_endpoint(client):
    response = client.get("/state")

    assert response.status_code == 200

    data = response.get_json()

    assert "current_word" in data
    assert "current_prediction" in data
    assert "confidence" in data


def test_predict_without_image(client):
    response = client.post("/predict", json={})

    assert response.status_code == 200

    data = response.get_json()
    assert data["error"] == "No image data"
