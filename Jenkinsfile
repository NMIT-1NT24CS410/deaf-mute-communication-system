pipeline {

    agent any

    environment {

        // Docker Configuration
        DOCKER_IMAGE = 'isl-communication-assistant'
        DOCKER_TAG = "${BUILD_NUMBER}"

        // SonarQube Configuration
        SONAR_PROJECT_KEY = 'isl-communication-assistant'

        // AWS EC2 Configuration
        EC2_HOST = 'YOUR_EC2_PUBLIC_IP'
        EC2_USER = 'ubuntu'

        // Jenkins SSH Credential ID
        SSH_KEY_ID = 'aws-ec2-ssh-key'
    }

    options {
        timestamps()
        timeout(time: 60, unit: 'MINUTES')
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

        // 2. Install Dependencies
        stage('Install Dependencies') {
            steps {
                sh '''
                    python3 -m venv venv
                    . venv/bin/activate

                    pip install --upgrade pip
                    pip install -r requirements.txt

                    pip install pylint pytest pytest-cov flake8
                '''
            }
        }

        // 3. Lint
        stage('Code Quality - Lint') {
            steps {
                sh '''
                    . venv/bin/activate

                    flake8 app.py \
                        --max-line-length=120 \
                        --statistics \
                        --count
                '''
            }
        }

        // 4. Unit Testing
        stage('Unit Testing') {

            steps {
                sh '''
                    mkdir -p reports

                    . venv/bin/activate

                    pytest tests/ \
                        --tb=short \
                        --junitxml=reports/test-results.xml \
                        --cov=. \
                        --cov-report=xml:reports/coverage.xml
                '''
            }

            post {
                always {
                    junit allowEmptyResults: true,
                          testResults: 'reports/test-results.xml'
                }
            }
        }

        // 5. SonarQube Analysis
        stage('SonarQube Analysis') {
            steps {

                withSonarQubeEnv('SonarQube') {

                    sh '''
                        sonar-scanner \
                            -Dsonar.projectKey=isl-communication-assistant \
                            -Dsonar.projectName="ISL Communication Assistant" \
                            -Dsonar.projectVersion=${BUILD_NUMBER} \
                            -Dsonar.sources=. \
                            -Dsonar.python.coverage.reportPaths=reports/coverage.xml \
                            -Dsonar.exclusions=venv/**,__pycache__/**,dataset/**,model/**,node_modules/**,.git/**
                    '''
                }
            }
        }

        // 6. Quality Gate
        stage('Quality Gate') {
            steps {

                timeout(time: 5, unit: 'MINUTES') {

                    waitForQualityGate abortPipeline: true

                }
            }
        }

        // 7. Docker Build
        stage('Docker Build') {
            steps {

                sh '''
                    docker build \
                        -t ${DOCKER_IMAGE}:${DOCKER_TAG} .

                '''
            }
        }

        // 8. Docker Save and Compress
        stage('Docker Save') {
            steps {

                sh '''
                    docker save ${DOCKER_IMAGE}:${DOCKER_TAG} \
                        | gzip -1 > isl-app.tar.gz

                    ls -lh isl-app.tar.gz
                '''
            }
        }

        // 9. Transfer Image to EC2
        stage('Transfer to AWS EC2') {

            when {
                branch 'main'
            }

            steps {

                sshagent(credentials: [SSH_KEY_ID]) {

                    sh '''
                        ssh -o StrictHostKeyChecking=accept-new \
                            ${EC2_USER}@${EC2_HOST} \
                            "mkdir -p /home/${EC2_USER}/isl-deployment"

                        scp -o StrictHostKeyChecking=accept-new \
                            isl-app.tar.gz \
                            ${EC2_USER}@${EC2_HOST}:/home/${EC2_USER}/isl-deployment/
                    '''
                }
            }
        }

        // 10. Deploy Application
        stage('Deploy to AWS EC2') {

            when {
                branch 'main'
            }

            steps {

                sshagent(credentials: [SSH_KEY_ID]) {

                    sh '''
                        ssh -o StrictHostKeyChecking=accept-new \
                            ${EC2_USER}@${EC2_HOST} \
                            "IMAGE='${DOCKER_IMAGE}:${DOCKER_TAG}' bash -s" <<'REMOTE'

                        set -e

                        cd /home/ubuntu/isl-deployment

                        echo "Loading Docker image..."

                        gunzip -c isl-app.tar.gz | docker load

                        echo "Stopping previous container..."

                        docker rm -f isl-app || true

                        echo "Starting new container..."

                        docker run -d \
                            --name isl-app \
                            --restart unless-stopped \
                            -p 5000:5000 \
                            "$IMAGE"

                        echo "Waiting for application health..."

                        sleep 60

                        STATUS=$(docker inspect \
                            --format='{{.State.Health.Status}}' isl-app)

                        if [ "$STATUS" != "healthy" ]; then

                            echo "Deployment health check failed!"

                            docker logs isl-app

                            exit 1

                        fi

                        echo "Application deployed successfully!"

                        docker image prune -f

                        rm -f isl-app.tar.gz

REMOTE
                    '''
                }
            }
        }
    }

    post {

        success {
            echo 'ISL Application CI/CD Pipeline completed successfully!'
        }

        failure {
            echo 'Pipeline failed. Check Jenkins console output.'
        }

        always {
            cleanWs()
        }
    }
}
