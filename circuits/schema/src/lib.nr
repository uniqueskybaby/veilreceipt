use poseidon::poseidon2::Poseidon2;

pub fn request_commitment(asset_id: u32, salt: Field) -> Field {
    Poseidon2::hash([1, asset_id as Field, salt], 3)
}

pub fn response_commitment(
    order_id: Field, request: Field, asset_id: u32, observed_at: u64,
    sample_count: u32, confidence_bps: u16, price_micros: u64, salt: Field,
) -> Field {
    Poseidon2::hash([
        2, order_id, request, asset_id as Field, observed_at as Field,
        sample_count as Field, confidence_bps as Field, price_micros as Field, salt,
    ], 9)
}

pub fn accepted(
    observed_at: u64, reference_time: u64, max_age: u64,
    sample_count: u32, min_samples: u32, confidence_bps: u16,
    min_confidence: u16, price_micros: u64,
) -> bool {
    // Avoid unsigned underflow when a dishonest provider supplies a future timestamp.
    let age = if observed_at <= reference_time { reference_time - observed_at } else { 0 };
    (observed_at <= reference_time) & (age <= max_age)
        & (sample_count >= min_samples) & (confidence_bps >= min_confidence)
        & (confidence_bps <= 10000) & (price_micros > 0)
}
