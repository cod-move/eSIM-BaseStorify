import { useLocalSearchParams } from 'expo-router';
import { ProductEditorScreen } from '@/features/products/product-editor-screen';

export default function EditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductEditorScreen id={id} />;
}
