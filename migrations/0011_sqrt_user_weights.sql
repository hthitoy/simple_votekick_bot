-- Migration: sqrt weights to shrink values
UPDATE users SET weight = sqrt(weight) WHERE weight > 0;
