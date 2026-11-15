
pipeline {
    agent any

    environment {
        DOCKER_IMAGE = 'isl-communication-assistant'
        DOCKER_TAG = "${BUILD_NUMBER}"

        SONAR_PROJECT_KEY = 'isl-communication-assistant'
        SONAR_SCANNER_IMAGE = 'sonarsource/sonar-scanner-cli:latest'

        APP_CONTAINER = 'isl-app'
    }

    options {
        timestamps()
        timeout(time: 90, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        // 1. Checkout
        stage('Checkout') {
            steps {
                echo 'Checking out GitHub repository...'
                checkout scm
            }
        }

        // 2. Python dependencies, lint and tests
        stage('Python CI - Lint and Tests') {
            steps {
                sh '''
                    set -e

                    mkdir -p reports

                    docker run --rm \
                        --network host \
                        -v "$WORKSPACE:/workspace" \
                        -w /workspace \
                        python:3.10-slim \
                        sh -ec '
                            apt-get update -qq

                            apt-get install -y -qq --no-install-recommends \
                                libgl1 \
                                libglib2.0-0 \
                                libsm6 \
                                libxext6 \
                                libxrender1 \
                                libgomp1

                            rm -rf /var/lib/apt/lists/*

                            pip install --no-cache-dir \
                                -r requirements.txt \
                                pytest pytest-cov flake8

                            echo "========== FLAKE8 LINT =========="

                            flake8 app.py \
                                --max-line-length=120 \
                                --statistics \
                                --count

                            echo "========== PYTEST =========="

                            mkdir -p reports

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

        // 3. SonarQube Analysis
        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        docker run --rm \
                            --network host \
                            -e SONAR_HOST_URL="$SONAR_HOST_URL" \
                            -e SONAR_TOKEN="$SONAR_AUTH_TOKEN" \
                            -v "$WORKSPACE:/usr/src" \
                            -w /usr/src \
                            "$SONAR_SCANNER_IMAGE" \
                            -Dsonar.projectKey="$SONAR_PROJECT_KEY" \
                            -Dsonar.projectName="ISL Communication Assistant" \
                            -Dsonar.projectVersion="$BUILD_NUMBER" \
                            -Dsonar.sources=app.py,main_app.py,step1_collect_dataset.py,step2_extract_landmarks.py,step3_train_model.py,step4_sign_to_speech.py,step5_text_to_sign.py \
                            -Dsonar.tests=tests \
                            -Dsonar.test.inclusions=tests/**/*.py \
                            -Dsonar.python.coverage.reportPaths=reports/coverage.xml \
                            -Dsonar.exclusions=dataset/**,model/**,isl_signs/**,.git/**,reports/**,**/__pycache__/**,*.csv
                    '''
                }
            }
        }

        // 4. Quality Gate
        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // 5. Build Docker Image
        stage('Docker Build') {
            steps {
                sh '''
                    docker build \
                        -t ${DOCKER_IMAGE}:${DOCKER_TAG} \
                        -t ${DOCKER_IMAGE}:latest .
                '''
            }
        }

        // 6. Deploy locally on the same EC2
        stage('Deploy to EC2') {
            steps {
                sh '''
                    set -e

                    echo "========== DEPLOYMENT =========="

                    PREVIOUS_IMAGE=$(docker inspect \
                        --format='{{.Config.Image}}' \
                        ${APP_CONTAINER} 2>/dev/null || true)

                    echo "Previous image: ${PREVIOUS_IMAGE:-None}"

                    docker rm -f ${APP_CONTAINER} || true

                    echo "Starting new application container..."

                    docker run -d \
                        --name ${APP_CONTAINER} \
                        --restart unless-stopped \
                        -p 5000:5000 \
                        ${DOCKER_IMAGE}:${DOCKER_TAG}

                    echo "Checking application health..."

                    HEALTHY=false

                    for i in $(seq 1 36); do
                        STATUS=$(docker inspect \
                            --format='{{.State.Health.Status}}' \
                            ${APP_CONTAINER} 2>/dev/null || echo "missing")

                        echo "Health check $i/36: $STATUS"

                        if [ "$STATUS" = "healthy" ]; then
                            HEALTHY=true
                            break
                        fi

                        if [ "$STATUS" = "unhealthy" ] || [ "$STATUS" = "missing" ]; then
                            break
                        fi

                        sleep 5
                    done

                    if [ "$HEALTHY" != "true" ]; then
                        echo "Deployment failed!"
                        docker logs ${APP_CONTAINER} || true

                        docker rm -f ${APP_CONTAINER} || true

                        if [ -n "$PREVIOUS_IMAGE" ] && \
                           docker image inspect "$PREVIOUS_IMAGE" >/dev/null 2>&1; then

                            echo "Rolling back to previous image..."

                            docker run -d \
                                --name ${APP_CONTAINER} \
                                --restart unless-stopped \
                                -p 5000:5000 \
                                "$PREVIOUS_IMAGE"
                        fi

                        exit 1
                    fi

                    echo "Application is healthy!"

                    docker ps --filter name=${APP_CONTAINER}

                    echo "Deployment completed successfully!"
                '''
            }
        }
    }

    post {
        success {
            echo 'ISL Communication Assistant CI/CD completed successfully!'
        }

        failure {
            echo 'Pipeline failed. Check Jenkins Console Output.'
        }

        always {
            cleanWs()
        }
    }
}
