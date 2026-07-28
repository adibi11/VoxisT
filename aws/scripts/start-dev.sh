#!/bin/bash

set -e

AWS_REGION="eu-central-1"



DB_INSTANCE="voxis"

CLUSTER_NAME="VoxisStaging"

SERVICES=(
  "VoxisApiService"
  "VoxisMessageWorker"
  "VoxisOutboundService"
  "BusinessEventService"
  "OutboxPublisherService"
  "VoxisFollowupScheduled"
)




for SERVICE in "${SERVICES[@]}"
do
    echo "Starting $SERVICE..."

    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $SERVICE \
        --desired-count 1 \
        --region $AWS_REGION
done

echo ""
echo "Voxis development environment is UP."