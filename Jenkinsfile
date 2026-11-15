// =================================================================
// Jenkinsfile — CI/CD Pipeline for ISL Communication Assistant
// Tools: Jenkins + SonarQube + Docker + AWS (EC2 deployment)
// =================================================================

pipeline {
    agent any

    environment {
        // ── Docker ──
        DOCKER_IMAGE      = 'isl-communication-assistant'
        DOCKER_TAG        = "${BUILD_NUMBER}"
        DOCKER_REGISTRY   = ''  // e.g. 'your-account-id.dkr.ecr.ap-south-1.amazonaws.com'

        // ── SonarQube ──
        SONAR_HOST_URL    = 'http://sonarqube:9000'   // or your SonarQube server URL
        SONAR_PROJECT_KEY = 'isl-communication-assistant'
        SONAR_TOKEN       = credentials('sonarqube-token')  // Jenkins credential ID

        // ── AWS ──
        AWS_REGION        = 'ap-south-1'
        EC2_HOST          = ''  // e.g. 'ec2-xx-xx-xx-xx.ap-south-1.compute.amazonaws.com'
        EC2_USER          = 'ubuntu'
        SSH_KEY_ID        = 'aws-ec2-ssh-key'  // Jenkins SSH credential ID
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        // ── Stage 1: Checkout ──
        stage('Checkout') {
            steps {
                echo '📥 Checking out source code...'
                checkout scm
            }
        }

        // ── Stage 2: Setup Python & Install Dependencies ──
        stage('Install Dependencies') {
            steps {
                echo '🐍 Setting up Python environment...'
                sh '''
                    python3 -m venv venv
                    . venv/bin/activate
                    pip install --upgrade pip
                    pip install -r requirements.txt
                    pip install pylint pytest pytest-cov flake8
                '''
            }
        }

        // ── Stage 3: Linting ──
        stage('Lint') {
            steps {
                echo '🔍 Running code linting...'
                sh '''
                    . venv/bin/activate
                    flake8 app.py --max-line-length=120 --statistics --count || true
                    pylint app.py --disable=all --enable=E --exit-zero
                '''
            }
        }

        // ── Stage 4: Unit Tests ──
        stage('Test') {
            steps {
                echo '🧪 Running unit tests...'
                sh '''
                    . venv/bin/activate
                    pytest tests/ --tb=short --junitxml=reports/test-results.xml \
                           --cov=. --cov-report=xml:reports/coverage.xml || true
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/test-results.xml'
                }
            }
        }

        // ── Stage 5: SonarQube Analysis ──
        stage('SonarQube Analysis') {
            steps {
                echo '📊 Running SonarQube code analysis...'
                withSonarQubeEnv('SonarQube') {  // Name configured in Jenkins → Manage Jenkins → SonarQube servers
                    sh '''
                        sonar-scanner \
                          -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                          -Dsonar.projectName="ISL Communication Assistant" \
                          -Dsonar.projectVersion=${BUILD_NUMBER} \
                          -Dsonar.sources=. \
                          -Dsonar.language=py \
                          -Dsonar.python.coverage.reportPaths=reports/coverage.xml \
                          -Dsonar.host.url=${SONAR_HOST_URL} \
                          -Dsonar.login=${SONAR_TOKEN} \
                          -Dsonar.exclusions=venv/**,__pycache__/**,dataset/**,.venv/**,node_modules/**
                    '''
                }
            }
        }

        // ── Stage 6: SonarQube Quality Gate ──
        stage('Quality Gate') {
            steps {
                echo '🚦 Waiting for SonarQube Quality Gate...'
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // ── Stage 7: Docker Build ──
        stage('Docker Build') {
            steps {
                echo '🐳 Building Docker image...'
                sh """
                    docker build -t ${DOCKER_IMAGE}:${DOCKER_TAG} .
                    docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${DOCKER_IMAGE}:latest
                """
            }
        }

        // ── Stage 8: Docker Push to Registry (ECR / DockerHub) ──
        stage('Docker Push') {
            when {
                branch 'main'
            }
            steps {
                echo '📤 Pushing Docker image to registry...'
                script {
                    if (DOCKER_REGISTRY?.trim()) {
                        // AWS ECR Login
                        sh """
                            aws ecr get-login-password --region ${AWS_REGION} | \
                            docker login --username AWS --password-stdin ${DOCKER_REGISTRY}

                            docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${DOCKER_TAG}
                            docker tag ${DOCKER_IMAGE}:latest ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:latest

                            docker push ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${DOCKER_TAG}
                            docker push ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:latest
                        """
                    } else {
                        echo '⚠️  DOCKER_REGISTRY not set — skipping push.'
                    }
                }
            }
        }

        // ── Stage 9: Deploy to AWS EC2 ──
        stage('Deploy to AWS') {
            when {
                branch 'main'
            }
            steps {
                echo '🚀 Deploying to AWS EC2...'
                script {
                    if (EC2_HOST?.trim()) {
                        sshagent(credentials: [SSH_KEY_ID]) {
                            sh """
                                ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_HOST} << 'ENDSSH'
                                    # Pull latest image
                                    docker pull ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:latest || true

                                    # Stop existing container
                                    docker stop isl-app || true
                                    docker rm isl-app || true

                                    # Run new container
                                    docker run -d \\
                                        --name isl-app \\
                                        --restart unless-stopped \\
                                        -p 5000:5000 \\
                                        ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:latest

                                    # Cleanup old images
                                    docker image prune -f
ENDSSH
                            """
                        }
                    } else {
                        echo '⚠️  EC2_HOST not set — skipping deployment.'
                    }
                }
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline completed successfully!'
        }
        failure {
            echo '❌ Pipeline failed! Check the logs above.'
        }
        always {
            echo '🧹 Cleaning up workspace...'
            cleanWs()
        }
    }
}
