#!/bin/bash
# @module: deploy_cloudrun
# Cloud Run deployment script for Estimator Assistant MCP
# Builds, pushes, and deploys to Google Cloud Run with proper configuration

set -e  # Exit on any error

# EA_ prefix for Estimator Assistant
PROJECT_ID="${EA_GCP_PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${EA_GCP_REGION:-us-central1}"
SERVICE_NAME="${EA_SERVICE_NAME:-estimator-assistant}"
IMAGE_NAME="${EA_IMAGE_NAME:-estimator-assistant}"
REPOSITORY="${EA_REPOSITORY:-estimator-assistant-repo}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if gcloud is installed and authenticated
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if user is authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        log_error "No active gcloud authentication found. Please run 'gcloud auth login'"
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check if .env.local exists
    if [ ! -f ".env.local" ]; then
        log_warning ".env.local not found. Using environment variables from shell."
    fi
    
    log_success "Prerequisites check passed"
}

# Set up Google Artifact Registry
setup_artifact_registry() {
    log_info "Setting up Google Artifact Registry..."
    
    # Enable required APIs
    gcloud services enable artifactregistry.googleapis.com \
        run.googleapis.com \
        cloudbuild.googleapis.com \
        sqladmin.googleapis.com \
        vpcaccess.googleapis.com \
        --project="$PROJECT_ID"
    
    # Create Artifact Registry repository if it doesn't exist
    if ! gcloud artifacts repositories describe "$REPOSITORY" \
        --location="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then
        
        log_info "Creating Artifact Registry repository: $REPOSITORY"
        gcloud artifacts repositories create "$REPOSITORY" \
            --repository-format=docker \
            --location="$REGION" \
            --description="Estimator Assistant MCP Docker images" \
            --project="$PROJECT_ID"
    else
        log_info "Artifact Registry repository already exists: $REPOSITORY"
    fi
    
    # Configure Docker authentication
    gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
    
    log_success "Artifact Registry setup complete"
}

# Build and push Docker image
build_and_push_image() {
    log_info "Building and pushing Docker image..."
    
    # Build the image
    log_info "Building Docker image..."
    docker build -t "$IMAGE_NAME" .
    
    # Tag for Artifact Registry
    local image_tag="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$IMAGE_NAME:latest"
    docker tag "$IMAGE_NAME" "$image_tag"
    
    # Push to Artifact Registry
    log_info "Pushing image to Artifact Registry..."
    docker push "$image_tag"
    
    log_success "Image pushed successfully: $image_tag"
    echo "$image_tag"
}

# Create VPC connector for Cloud SQL access
create_vpc_connector() {
    local connector_name="estimator-connector"
    
    log_info "Setting up VPC connector for Cloud SQL access..."
    
    # Check if VPC connector already exists
    if gcloud compute networks vpc-access connectors describe "$connector_name" \
        --region="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then
        log_info "VPC connector already exists: $connector_name"
    else
        log_info "Creating VPC connector: $connector_name"
        gcloud compute networks vpc-access connectors create "$connector_name" \
            --region="$REGION" \
            --subnet=vpc-connector-subnet \
            --subnet-project="$PROJECT_ID" \
            --min-instances=2 \
            --max-instances=3 \
            --project="$PROJECT_ID"
    fi
    
    echo "projects/$PROJECT_ID/locations/$REGION/connectors/$connector_name"
}

# Load environment variables from .env.local
load_env_vars() {
    local env_vars=""
    
    if [ -f ".env.local" ]; then
        log_info "Loading environment variables from .env.local..."
        
        # Read .env.local and format for Cloud Run
        while IFS= read -r line || [ -n "$line" ]; do
            # Skip comments and empty lines
            if [[ ! "$line" =~ ^[[:space:]]*# ]] && [[ -n "$line" ]]; then
                # Remove any trailing whitespace
                line=$(echo "$line" | sed 's/[[:space:]]*$//')
                env_vars="$env_vars,$line"
            fi
        done < .env.local
        
        # Remove leading comma
        env_vars="${env_vars#,}"
    else
        log_warning "No .env.local file found. Using minimal environment variables."
        env_vars="NODE_ENV=production"
    fi
    
    echo "$env_vars"
}

# Deploy to Cloud Run
deploy_to_cloud_run() {
    local image_url="$1"
    local vpc_connector="$2"
    local env_vars="$3"
    
    log_info "Deploying to Cloud Run..."
    
    # Prepare deployment command
    local deploy_cmd="gcloud run deploy $SERVICE_NAME \
        --image=\"$image_url\" \
        --region=\"$REGION\" \
        --platform=\"managed\" \
        --allow-unauthenticated \
        --min-instances=\"1\" \
        --max-instances=\"5\" \
        --memory=\"2Gi\" \
        --cpu=\"2\" \
        --timeout=\"900\" \
        --concurrency=\"100\" \
        --port=\"3000\" \
        --project=\"$PROJECT_ID\""
    
    # Add VPC connector if available
    if [ -n "$vpc_connector" ]; then
        deploy_cmd="$deploy_cmd --vpc-connector=\"$vpc_connector\""
        deploy_cmd="$deploy_cmd --vpc-egress=all"
    fi
    
    # Add environment variables
    if [ -n "$env_vars" ]; then
        deploy_cmd="$deploy_cmd --set-env-vars=\"$env_vars\""
    fi
    
    # Execute deployment
    eval "$deploy_cmd"
    
    log_success "Deployment to Cloud Run completed"
}

# Enable logging and error reporting
enable_monitoring() {
    log_info "Enabling monitoring and logging..."
    
    # Enable Cloud Logging API
    gcloud services enable logging.googleapis.com --project="$PROJECT_ID"
    
    # Enable Error Reporting API
    gcloud services enable clouderrorreporting.googleapis.com --project="$PROJECT_ID"
    
    # Enable Cloud Monitoring API
    gcloud services enable monitoring.googleapis.com --project="$PROJECT_ID"
    
    log_success "Monitoring and logging enabled"
}

# Get service URL
get_service_url() {
    local service_url
    service_url=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(status.url)")
    
    echo "$service_url"
}

# Test deployment
test_deployment() {
    local service_url="$1"
    
    log_info "Testing deployment..."
    
    # Wait a moment for the service to be ready
    sleep 10
    
    # Test health endpoint
    if curl -f -s "$service_url/api/health" > /dev/null; then
        log_success "Health check passed"
    else
        log_warning "Health check failed - service may still be starting"
    fi
    
    # Test metrics endpoint
    if curl -f -s "$service_url/api/metrics" > /dev/null; then
        log_success "Metrics endpoint accessible"
    else
        log_warning "Metrics endpoint not accessible"
    fi
}

# Main deployment function
main() {
    log_info "Starting Estimator Assistant MCP deployment to Cloud Run"
    log_info "Project: $PROJECT_ID"
    log_info "Region: $REGION"
    log_info "Service: $SERVICE_NAME"
    echo
    
    # Check prerequisites
    check_prerequisites
    echo
    
    # Set up Artifact Registry
    setup_artifact_registry
    echo
    
    # Build and push image
    local image_url
    image_url=$(build_and_push_image)
    echo
    
    # Create VPC connector
    local vpc_connector
    vpc_connector=$(create_vpc_connector)
    echo
    
    # Load environment variables
    local env_vars
    env_vars=$(load_env_vars)
    echo
    
    # Deploy to Cloud Run
    deploy_to_cloud_run "$image_url" "$vpc_connector" "$env_vars"
    echo
    
    # Enable monitoring
    enable_monitoring
    echo
    
    # Get service URL
    local service_url
    service_url=$(get_service_url)
    echo
    
    # Test deployment
    test_deployment "$service_url"
    echo
    
    # Final summary
    log_success "Deployment completed successfully!"
    echo
    echo "Service URL: $service_url"
    echo "Health Check: $service_url/api/health"
    echo "Metrics: $service_url/api/metrics"
    echo "Logs: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME/logs?project=$PROJECT_ID"
    echo
    echo "To update the service, run this script again."
    echo "To delete the service, run: gcloud run services delete $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --dry-run      Show what would be deployed without actually deploying"
        echo
        echo "Environment Variables:"
        echo "  EA_GCP_PROJECT_ID    GCP Project ID (default: current gcloud project)"
        echo "  EA_GCP_REGION        GCP Region (default: us-central1)"
        echo "  EA_SERVICE_NAME      Cloud Run service name (default: estimator-assistant)"
        echo "  EA_IMAGE_NAME        Docker image name (default: estimator-assistant)"
        echo "  EA_REPOSITORY        Artifact Registry repository (default: estimator-assistant-repo)"
        echo
        echo "Prerequisites:"
        echo "  - gcloud CLI installed and authenticated"
        echo "  - Docker running"
        echo "  - .env.local file with required environment variables"
        exit 0
        ;;
    --dry-run)
        log_info "Dry run mode - showing what would be deployed"
        echo "Project: $PROJECT_ID"
        echo "Region: $REGION"
        echo "Service: $SERVICE_NAME"
        echo "Image: $REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$IMAGE_NAME:latest"
        echo "VPC Connector: ${SERVICE_NAME}-vpc-connector"
        echo "Environment variables: $(load_env_vars)"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
