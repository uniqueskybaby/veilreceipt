fn main(
    order_id: pub Field,
    request_commitment: pub Field,
    response_commitment: pub Field,
    reference_time: pub u64,
    max_age: pub u64,
    min_samples: pub u32,
    min_confidence: pub u16,
    outcome: pub bool,
    asset_id: u32,
    request_salt: Field,
    response_asset_id: u32,
    observed_at: u64,
    sample_count: u32,
    confidence_bps: u16,
    price_micros: u64,
    response_salt: Field,
) {
    assert_eq(schema::request_commitment(asset_id, request_salt), request_commitment);
    assert_eq(schema::response_commitment(
        order_id, request_commitment, response_asset_id, observed_at,
        sample_count, confidence_bps, price_micros, response_salt,
    ), response_commitment);
    let verdict = (asset_id == response_asset_id) & schema::accepted(
        observed_at, reference_time, max_age, sample_count, min_samples,
        confidence_bps, min_confidence, price_micros,
    );
    assert_eq(verdict, outcome);
}
