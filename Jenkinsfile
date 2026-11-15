
pipeline {
    agent any

    environment {
        // Docker configuration
        DOCKER_IMAGE = 'isl-communication-assistant'
        DOCKER_TAG = "${BUILD_NUMBER}"

        // SonarQube configuration
        SONAR_PROJECT_KEY = 'isl-communication-assistant'
        SONAR_SCANNER_IMAGE = 'sonarsource/sonar-scanner-cli:latest'

        // Application configuration
        APP_CONTAINER = 'isl-app'
        APP_PORT = '5000'
    }

    options {
        timestamps()
        timeout(time: 90, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        // ==========================================
        // 1. CHECKOUT
        // ==========================================

        stage('Checkout') {
            steps {
                checkout scm
                sh 'echo "Source code checked out successfully"'
            }
        }

        // ==========================================
        // 2. PYTHON LINT AND TESTS
        // ==========================================

        stage('Python CI - Lint and Tests') {
            steps {
                sh '''
                    set -eu

                    mkdir -p reports

                    docker run --rm \
                        --network host \
                        -v "$WORKSPACE:/workspace" \
                        -w /workspace \
                        python:3.10-slim \
                        sh -ec '
                            apt-get update

                            apt-get install -y --no-install-recommends \
                                libgl1 \
                                libglib2.0-0 \
                                libsm6 \
                                libxext6 \
                                libxrender1 \
                                libgomp1

                            pip install --no-cache-dir -r requirements.txt
                            pip install --no-cache-dir pytest-cov flake8

                            echo "===== PYTHON LINT ====="

                            flake8 app.py \
                                --max-line-length=120 \
                                --statistics \
                                --count \
                                --extend-ignore=E302,E305,E261,E501,W293,F401,F824

                            echo "===== PYTHON TESTS ====="

                            PYTHONPATH=/workspace python -m pytest tests/ \
                                --tb=short \
                                --junitxml=reports/test-results.xml \
                                --cov=app \
                                --cov-report=xml:reports/coverage.xml
                        '
                '''
            }

            post {
                always {
                    junit allowEmptyResults: true,
                          testResults: 'reports/test-results.xml'

                    archiveArtifacts artifacts: 'reports/*.xml',
                                     allowEmptyArchive: true
                }
            }
        }

        // ==========================================
        // 3. SONARQUBE ANALYSIS
        // ==========================================

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        set -eu

                        echo "===== SONARQUBE ANALYSIS ====="

                        mkdir -p "$WORKSPACE/.sonar/cache"
                        mkdir -p "$WORKSPACE/.scannerwork"

                        docker run --rm \
                            --user "$(id -u):$(id -g)" \
                            --network host \
                            -e SONAR_HOST_URL="$SONAR_HOST_URL" \
                            -e SONAR_TOKEN="$SONAR_AUTH_TOKEN" \
                            -e SONAR_USER_HOME=/usr/src/.sonar \
                            -v "$WORKSPACE:/usr/src" \
                            -w /usr/src \
                            "$SONAR_SCANNER_IMAGE" \
                            -Dsonar.projectKey="$SONAR_PROJECT_KEY" \
                            -Dsonar.projectName="ISL Communication Assistant" \
                            -Dsonar.projectVersion="$BUILD_NUMBER" \
                            -Dsonar.working.directory=/usr/src/.scannerwork \
                            -Dsonar.sources=app.py \
                            -Dsonar.tests=tests \
                            -Dsonar.test.inclusions="tests/**/*.py" \
                            -Dsonar.python.coverage.reportPaths=reports/coverage.xml \
                            -Dsonar.exclusions="dataset/**,model/**,isl_signs/**,reports/**,*.csv,**/__pycache__/**"

                        echo "===== SONARQUBE ANALYSIS COMPLETED ====="
                    '''
                }
            }
        }

        // ==========================================
        // 4. SONARQUBE QUALITY GATE
        // ==========================================

        stage('SonarQube Quality Gate') {
            steps {
                timeout(time: 10, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // ==========================================
        // 5. DOCKER BUILD
        // ==========================================

        stage('Docker Build') {
            steps {
                sh '''
                    set -eu

                    echo "===== BUILDING DOCKER IMAGE ====="

                    docker build \
                        -t "$DOCKER_IMAGE:$DOCKER_TAG" \
                        -t "$DOCKER_IMAGE:latest" \
                        .

                    echo "===== DOCKER BUILD SUCCESSFUL ====="
                '''
            }
        }

        // ==========================================
        // 6. DEPLOY TO EC2
        // ==========================================

        stage('Deploy to EC2') {
            steps {
                sh '''
                    set -eu

                    echo "===== CHECKING DATASET ====="

                    if [ ! -d /opt/isl-data ]; then
                        echo "ERROR: Dataset directory /opt/isl-data not found!"
                        exit 1
                    fi

                    echo "Dataset directory found."
                    du -sh /opt/isl-data

                    echo "===== DEPLOYING APPLICATION ====="

                    NEW_IMAGE="$DOCKER_IMAGE:$DOCKER_TAG"

                    OLD_IMAGE=$(docker inspect \
                        --format='{{.Config.Image}}' \
                        "$APP_CONTAINER" 2>/dev/null || true)

                    docker rm -f "$APP_CONTAINER" 2>/dev/null || true

                    if ! docker run -d \
                        --name "$APP_CONTAINER" \
                        --restart unless-stopped \
                        -p "$APP_PORT:5000" \
                        -v /opt/isl-data:/app/dataset:ro \
                        "$NEW_IMAGE"; then

                        echo "New deployment failed."

                        if [ -n "$OLD_IMAGE" ]; then
                            echo "Restoring previous image."

                            docker run -d \
                                --name "$APP_CONTAINER" \
                                --restart unless-stopped \
                                -p "$APP_PORT:5000" \
                                -v /opt/isl-data:/app/dataset:ro \
                                "$OLD_IMAGE" || true
                        fi

                        exit 1
                    fi

                    echo "===== CHECKING APPLICATION HEALTH ====="

                    HEALTHY=false

                    for i in $(seq 1 36); do

                        STATUS=$(docker inspect \
                            --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
                            "$APP_CONTAINER" 2>/dev/null || echo "missing")

                        echo "Health check $i/36: $STATUS"

                        if [ "$STATUS" = "healthy" ]; then
                            HEALTHY=true
                            break
                        fi

                        if [ "$STATUS" = "exited" ] || [ "$STATUS" = "missing" ]; then
                            break
                        fi

                        sleep 5
                    done

                    if [ "$HEALTHY" != "true" ]; then

                        echo "Deployment health check failed."

                        docker logs "$APP_CONTAINER" 2>/dev/null || true

                        docker rm -f "$APP_CONTAINER" 2>/dev/null || true

                        if [ -n "$OLD_IMAGE" ]; then
                            echo "Rolling back to previous image."

                            docker run -d \
                                --name "$APP_CONTAINER" \
                                --restart unless-stopped \
                                -p "$APP_PORT:5000" \
                                -v /opt/isl-data:/app/dataset:ro \
                                "$OLD_IMAGE" || true
                        fi

                        exit 1
                    fi

                    echo "===== DEPLOYMENT SUCCESSFUL ====="

                    docker ps --filter "name=$APP_CONTAINER"

                    echo "===== DATASET MOUNT VERIFICATION ====="

                    docker exec "$APP_CONTAINER" \
                        sh -c 'du -sh /app/dataset && find /app/dataset -type f | wc -l'
                '''
            }
        }
    }

    // ==========================================
    // POST BUILD ACTIONS
    // ==========================================

    post {
        success {
            echo 'ISL CI/CD pipeline completed successfully!'
        }

        failure {
            echo 'ISL CI/CD pipeline failed. Check the failed stage logs.'
        }

        always {
            cleanWs()
        }
    }
}

