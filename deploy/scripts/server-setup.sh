#!/bin/bash
set -euo pipefail

echo "========================================="
echo "  AIGateway-Agent Server Setup Script"
echo "========================================="

# =========================================
# Step 1: Mount data disk
# =========================================
echo ""
echo "[Step 1] Checking data disk /dev/vdb..."

if mountpoint -q /data; then
  echo "  /data is already mounted, skipping."
else
  if [ -b /dev/vdb ]; then
    # Check if already formatted
    if ! blkid /dev/vdb | grep -q ext4; then
      echo "  Formatting /dev/vdb as ext4..."
      mkfs.ext4 /dev/vdb
    else
      echo "  /dev/vdb already formatted as ext4."
    fi

    mkdir -p /data
    mount /dev/vdb /data
    echo "  Mounted /dev/vdb to /data."

    # Add to fstab if not already present
    if ! grep -q '/dev/vdb' /etc/fstab; then
      echo '/dev/vdb /data ext4 defaults 0 0' >> /etc/fstab
      echo "  Added /dev/vdb to /etc/fstab."
    fi
  else
    echo "  WARNING: /dev/vdb not found. Using root filesystem for /data."
    mkdir -p /data
  fi
fi

mkdir -p /data/docker /data/project
echo "  Created /data/docker and /data/project directories."

# =========================================
# Step 2: Install Docker
# =========================================
echo ""
echo "[Step 2] Installing Docker..."

if command -v docker &> /dev/null; then
  echo "  Docker already installed: $(docker --version)"
else
  echo "  Installing Docker CE..."

  # Install prerequisites
  yum install -y yum-utils device-mapper-persistent-data lvm2

  # Add Alibaba Cloud Docker CE repo
  yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo

  # Install Docker CE (compatible with CentOS 7)
  yum install -y docker-ce docker-ce-cli containerd.io

  echo "  Docker installed: $(docker --version)"
fi

# Configure Docker daemon
echo "  Configuring Docker daemon..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'DAEMON_EOF'
{
  "data-root": "/data/docker",
  "storage-driver": "overlay2",
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.m.daocloud.io"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
DAEMON_EOF

# Start and enable Docker
systemctl daemon-reload
systemctl enable docker
systemctl start docker
echo "  Docker started and enabled."

# =========================================
# Step 3: Install Docker Compose v2
# =========================================
echo ""
echo "[Step 3] Installing Docker Compose v2..."

if docker compose version &> /dev/null; then
  echo "  Docker Compose already installed: $(docker compose version)"
else
  echo "  Installing Docker Compose plugin..."
  mkdir -p /usr/local/lib/docker/cli-plugins
  COMPOSE_VERSION="v2.29.7"
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  echo "  Docker Compose installed: $(docker compose version)"
fi

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo "  Docker: $(docker --version)"
echo "  Compose: $(docker compose version)"
echo "  Data root: /data/docker"
echo "  Project dir: /data/project"
echo "========================================="
