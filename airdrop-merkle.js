(function (root) {
  function ethersLib() {
    const e = root.ethers;
    if (!e) throw new Error("ethers");
    return e;
  }

  function leaf(addr, amount) {
    const e = ethersLib();
    const amt = typeof amount === "bigint" ? amount : BigInt(amount);
    const inner = e.keccak256(e.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [addr, amt]));
    return e.keccak256(inner);
  }

  function hashPair(a, b) {
    const e = ethersLib();
    const aa = String(a).toLowerCase();
    const bb = String(b).toLowerCase();
    return aa < bb ? e.keccak256(e.concat([a, b])) : e.keccak256(e.concat([b, a]));
  }

  function build(leaves) {
    if (!leaves.length) throw new Error("empty");
    const layers = [leaves.slice()];
    while (layers[layers.length - 1].length > 1) {
      const prev = layers[layers.length - 1];
      const next = [];
      for (let i = 0; i < prev.length; i += 2) {
        if (i + 1 === prev.length) next.push(prev[i]);
        else next.push(hashPair(prev[i], prev[i + 1]));
      }
      layers.push(next);
    }
    return { layers, root: layers[layers.length - 1][0] };
  }

  function proof(layers, index) {
    const out = [];
    for (let L = 0; L < layers.length - 1; L++) {
      const layer = layers[L];
      const sib = index % 2 === 0 ? index + 1 : index - 1;
      if (sib < layer.length) out.push(layer[sib]);
      index = Math.floor(index / 2);
    }
    return out;
  }

  function verify(proofs, rootHash, leafHash) {
    let h = leafHash;
    for (let i = 0; i < proofs.length; i++) h = hashPair(h, proofs[i]);
    return String(h).toLowerCase() === String(rootHash).toLowerCase();
  }

  root.CatboxMerkle = { leaf, hashPair, build, proof, verify };
})(typeof window !== "undefined" ? window : globalThis);
