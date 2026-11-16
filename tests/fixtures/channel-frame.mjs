export const mount={source:'Verified test aggregate base',verified:true,target:'factory-base',axisX:0,flowOffsetMm:0,
 bodyBounds:{minX:-250,maxX:250,minY:-300,maxY:500},
 mounting:{verified:true,source:'Verified test base drilling',bounds:{minX:-250,maxX:250,minY:-240,maxY:240},footThicknessMm:15,boltDiameterMm:16,
 holes:[[-235,-225],[235,-225],[-235,225],[235,225]].map(([x,y],i)=>({id:`h${i}`,owner:'pump',x,y,diameterMm:17,clearanceMm:17}))}};
export const pump={id:'fixture-horizontal',name:'Horizontal fixture',type:'end_suction',count:3,circuit:1,massKg:500,mounting:mount,
 spacing:{mm:530,status:'confirmed',source:'Specified axis spacing'}};
export const cabinet={equipmentId:'fixture-cabinet',source:'Verified test cabinet and stands',verified:true,widthMm:800,heightMm:1000,depthMm:300,serviceClearanceMm:50,
 doorDirection:'rear',uprightBounds:{minX:-400,maxX:400,minY:-30,maxY:0},
 bodyBounds:{minX:-400,maxX:400,minY:-200,maxY:200},
 mounting:{verified:true,source:'Verified test stand grid',bounds:{minX:-400,maxX:400,minY:-200,maxY:200},footThicknessMm:6,boltDiameterMm:8,
 holes:[[-380,-175],[380,-175],[-380,175],[380,175]].map(([x,y],i)=>({id:`c${i}`,owner:'cabinet',x,y,diameterMm:10,clearanceMm:10}))}};
export const inputs={cabinet,foundationHoleMm:12,foundationSource:'Test fixture clearance hole, not an anchor capacity approval',fluidMassKg:25};
