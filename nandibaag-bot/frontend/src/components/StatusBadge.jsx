import React from 'react';

const statusConfig = {
  active: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-l-green-500',
    dot: 'bg-green-500',
    label: 'Active'
  },
  maintenance: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-l-amber-500',
    dot: 'bg-amber-500',
    label: 'Maintenance'
  },
  deleted: {
    bg: 'bg-gray-100',
    text: 'text-gray-500',
    border: 'border-l-gray-500',
    dot: 'bg-gray-500',
    label: 'Deleted'
  }
};

const SIZE_STYLES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1'
};

export default function StatusBadge({ status, variant = 'badge', size = 'sm' }) {
  const config = statusConfig[status] || statusConfig.active;

  if (variant === 'border') {
    return <div className={`w-1 h-full ${config.border} border-l-4`} />;
  }

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${config.bg} ${config.text} ${SIZE_STYLES[size]}`}>
      {config.label}
    </span>
  );
}

export function statusBorderColor(status) {
  const config = statusConfig[status] || statusConfig.active;
  return config.border;
}

export function statusDotColor(status) {
  const config = statusConfig[status] || statusConfig.active;
  return config.dot;
}
