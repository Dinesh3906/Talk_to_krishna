import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface KrishnaAvatarProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

const krishnaAvatarImg = require('../../assets/images/krishna-avatar.png');

export const KrishnaAvatar: React.FC<KrishnaAvatarProps> = ({ size = 28, style }) => {
  return (
    <Image
      source={krishnaAvatarImg}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
      resizeMode="cover"
    />
  );
};
