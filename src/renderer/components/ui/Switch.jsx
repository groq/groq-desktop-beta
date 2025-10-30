import React from 'react';

const Switch = ({ checked, onChange, id, size = 'default' }) => {
  const sizeClasses = {
    sm: {
      track: 'w-8 h-4',
      circle: 'after:h-3 after:w-3',
      translate: 'peer-checked:after:translate-x-[15px]'
    },
    default: {
      track: 'w-11 h-6',
      circle: 'after:h-5 after:w-5',
      translate: 'peer-checked:after:translate-x-full'
    }
  };
  
  const sizeConfig = sizeClasses[size] || sizeClasses.default;
  
  return (
    <label htmlFor={id} className="inline-flex relative items-center cursor-pointer">
      <input
        type="checkbox"
        id={id}
        className="sr-only peer"
        checked={checked}
        onChange={onChange}
        readOnly
      />
      <div
        onClick={onChange}
        className={`${sizeConfig.track} ${sizeConfig.circle} ${sizeConfig.translate} bg-gray-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-500 dark:peer-focus:ring-blue-600 dark:bg-gray-700 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:transition-all dark:border-gray-600 peer-checked:bg-blue-600`}
      ></div>
    </label>
  );
};

export default Switch; 