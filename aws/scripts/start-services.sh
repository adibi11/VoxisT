#!/bin/bash

set -e

CLUSTER="VoxisStaging"
REGION="eu-central-1"

SERVICES=(
    "BusinessEventService"
    "OutboxPublisherService"
    "VoxisApiService"
    "VoxisFollowupScheduled"
    "VoxisMessageWorker"
    "VoxisOutboundService"
)

echo "Starting ECS services..."

for service in "${SERVICES[@]}"; do
    echo "Starting $service..."
    aws ecs update-service \
        --cluster "$CLUSTER" \
        --service "$service" \
        --desired-count 1 \
        --region "$REGION"
done

echo "All services started."


aws ecs describe-tasks \
  --cluster VoxisStaging \
  --tasks arn:aws:ecs:eu-central-1:147997143638:task/VoxisStaging/bd5f0f124cb544bb87c71d5299250240 \
  --region eu-central-1 \
  --query 'tasks[0].attachments[0].details'