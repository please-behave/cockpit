fn main() {
    println!("cargo:rerun-if-changed=frontend/dist/assets");
    println!("cargo:rerun-if-changed=frontend/dist/index.html");
    println!("cargo:rerun-if-changed=frontend/dist/sign-in.html");
}
