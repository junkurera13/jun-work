#version 300 es
precision highp float;
precision highp int;

out vec4 outColor;

uniform vec2 uRes;
uniform float uTime;

#include "common.glsl"
#include "background.glsl"

void main() {
  outColor = vec4(background(gl_FragCoord.xy), 1.0);
}
